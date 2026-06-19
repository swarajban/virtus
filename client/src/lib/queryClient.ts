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

/**
 * QueryClient configured for FLAKY GYM WIFI:
 *
 * - staleTime: 2min — show cached data immediately, revalidate in background.
 *   Gym wifi is spotty but exercise/1RM data doesn't change mid-workout.
 *
 * - gcTime: 10min — keep unused queries in cache longer than default (5min)
 *   so navigating back/forth doesn't refetch constantly.
 *
 * - retry: 3 attempts with exponential backoff (1s → 2s → 4s) — network hiccups
 *   are common but usually resolve within seconds. Max 3 tries avoids long hangs.
 *
 * - refetchOnWindowFocus: true — when user returns to tab, refresh data if stale.
 *   Good UX when switching between timer/music and coming back.
 *
 * - networkMode: 'online' — only fetch when online, queue mutations when offline.
 *   Prevents error spam on connection drops; mutations auto-retry when back online.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: true,
      staleTime: 2 * 60 * 1000, // 2 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (previously cacheTime)
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      networkMode: 'online',
    },
    mutations: {
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
      networkMode: 'online',
    },
  },
});
