export const READ_REQUEST_TIMEOUT_MS = 10_000;
export const WRITE_REQUEST_TIMEOUT_MS = 30_000;

type TimeoutSignal = {
  signal: AbortSignal;
  cleanup: () => void;
};

type FetchTimeoutOptions = {
  timeoutMs?: number;
};

const noop = () => {};

function isWriteMethod(method: string | undefined): boolean {
  const normalized = method?.toUpperCase() ?? "GET";
  return !["GET", "HEAD", "OPTIONS"].includes(normalized);
}

function timeoutForInit(init?: RequestInit): number {
  return isWriteMethod(init?.method) ? WRITE_REQUEST_TIMEOUT_MS : READ_REQUEST_TIMEOUT_MS;
}

function getAbortReason(signal: AbortSignal): unknown {
  return "reason" in signal ? signal.reason : undefined;
}

function createTimeoutSignal(timeoutMs: number): TimeoutSignal {
  const AbortSignalCtor = AbortSignal as typeof AbortSignal & {
    timeout?: (milliseconds: number) => AbortSignal;
  };

  if (typeof AbortSignalCtor.timeout === "function") {
    return { signal: AbortSignalCtor.timeout(timeoutMs), cleanup: noop };
  }

  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    const reason =
      typeof DOMException === "function"
        ? new DOMException(`Request timed out after ${timeoutMs}ms`, "TimeoutError")
        : new Error(`Request timed out after ${timeoutMs}ms`);
    controller.abort(reason);
  }, timeoutMs);

  return {
    signal: controller.signal,
    cleanup: () => globalThis.clearTimeout(timeoutId),
  };
}

function mergeAbortSignals(signals: AbortSignal[]): TimeoutSignal {
  const activeSignals = signals.filter(Boolean);

  if (activeSignals.length === 1) {
    return { signal: activeSignals[0], cleanup: noop };
  }

  const controller = new AbortController();
  const abort = (signal: AbortSignal) => {
    if (!controller.signal.aborted) {
      controller.abort(getAbortReason(signal));
    }
  };
  const listeners: Array<[AbortSignal, () => void]> = [];

  for (const signal of activeSignals) {
    if (signal.aborted) {
      abort(signal);
      break;
    }

    const listener = () => abort(signal);
    signal.addEventListener("abort", listener, { once: true });
    listeners.push([signal, listener]);
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      for (const [signal, listener] of listeners) {
        signal.removeEventListener("abort", listener);
      }
    },
  };
}

function requestLabel(input: RequestInfo | URL, init?: RequestInit): string {
  const method = init?.method?.toUpperCase() ?? "GET";
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  return `${method} ${url}`;
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === "AbortError"
  ) || (
    error instanceof Error && error.name === "AbortError"
  );
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: FetchTimeoutOptions = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? timeoutForInit(init);
  const timeout = createTimeoutSignal(timeoutMs);
  const merged = init.signal
    ? mergeAbortSignals([init.signal, timeout.signal])
    : { signal: timeout.signal, cleanup: noop };

  try {
    return await fetch(input, {
      ...init,
      signal: merged.signal,
    });
  } catch (error) {
    const timedOut = timeout.signal.aborted && !init.signal?.aborted;
    if (timedOut || (timeout.signal.aborted && isAbortError(error))) {
      const timeoutError = new Error(
        `Request timed out after ${timeoutMs}ms: ${requestLabel(input, init)}`,
      );
      timeoutError.name = "TimeoutError";
      throw timeoutError;
    }
    throw error;
  } finally {
    merged.cleanup();
    timeout.cleanup();
  }
}
