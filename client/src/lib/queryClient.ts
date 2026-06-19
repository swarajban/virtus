import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: HeadersInit = {
    'x-username': localStorage.getItem('selected-username') || 'demo'
  };
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers: {
        'x-username': localStorage.getItem('selected-username') || 'demo'
      }
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

// Exponential backoff helper: 1s → 2s → 4s → ... up to maxDelayMs
const createRetryDelay = (maxDelayMs: number) =>
  (failureCount: number) => Math.min(1000 * 2 ** failureCount, maxDelayMs);

/**
 * QueryClient configured for FLAKY GYM WIFI:
 *
 * - staleTime: 5min — cached data stays fresh longer for gym sessions (60-90min).
 *   Exercise/1RM data rarely changes mid-workout; longer staleTime = fewer refetches.
 *
 * - gcTime: 30min — keep cache through entire workout session (60-90min typical).
 *   Navigating away from exercises for 10min+ won't clear cache.
 *
 * - retry: 3 attempts with exponential backoff (1s → 2s → 4s), but NOT for auth errors
 *   (401/403) which won't resolve with retries. Network hiccups usually resolve quickly.
 *
 * - refetchOnWindowFocus: false — avoid refetch spam when switching to timer/music apps.
 *   Longer staleTime handles freshness; focus-based refetching creates errors on flaky wifi.
 *
 * - networkMode: 'online' — pause queries/mutations when offline (prevents error spam).
 *   NOTE: Mutations are paused, NOT queued — no persistence layer for offline writes.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 60 * 1000, // 30 minutes (covers typical workout session)
      retry: (failureCount, error) => {
        // Don't retry auth errors (401/403) - they won't resolve
        if (error instanceof Error && /^(401|403):/.test(error.message)) {
          return false;
        }
        return failureCount < 3;
      },
      retryDelay: createRetryDelay(10000), // Cap at 10s instead of 30s
      networkMode: 'online',
    },
    mutations: {
      retry: 3, // Match queries - writes are critical, need same resilience
      retryDelay: createRetryDelay(10000),
      networkMode: 'online',
    },
  },
});
