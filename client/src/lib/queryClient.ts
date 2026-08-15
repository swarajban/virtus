import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { fetchWithTimeout } from "./fetch-with-timeout";

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
  
  const res = await fetchWithTimeout(url, {
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
  async ({ queryKey, signal }) => {
    const res = await fetchWithTimeout(queryKey.join("/") as string, {
      credentials: "include",
      signal,
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
 * - staleTime: 5min — freshness window only. Stale cached data still renders while
 *   React Query revalidates in the background, so freshness does not gate exercise UI.
 *
 * - gcTime: 2h — keep cache through an entire 60-90min workout plus phone-lock gaps.
 *   This prevents a 35min pause from evicting warm exercise/1RM/history data.
 *
 * - retry: 3 attempts with exponential backoff (1s → 2s → 4s), but NOT for auth errors
 *   (401/403) which won't resolve with retries. Network hiccups usually resolve quickly.
 *
 * - refetchOnWindowFocus: false — avoid refetch spam when switching to timer/music apps.
 *   Stale cached data remains visible; focus-based refetching creates errors on flaky wifi.
 *
 * - networkMode: 'offlineFirst' — try once even if navigator.onLine is lying (common
 *   on iOS unlock / wifi-cell handoff), then pause retries after a real failure.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes; stale cache still renders while refetching
      gcTime: 2 * 60 * 60 * 1000, // 2 hours; covers a full workout plus lock gaps
      retry: (failureCount, error) => {
        // Don't retry auth errors (401/403) - they won't resolve
        if (error instanceof Error && /^(401|403):/.test(error.message)) {
          return false;
        }
        return failureCount < 3;
      },
      retryDelay: createRetryDelay(10000), // Cap at 10s instead of 30s
      networkMode: 'offlineFirst',
    },
    mutations: {
      retry: 3, // Match queries - writes are critical, need same resilience
      retryDelay: createRetryDelay(10000),
      networkMode: 'offlineFirst',
    },
  },
});
