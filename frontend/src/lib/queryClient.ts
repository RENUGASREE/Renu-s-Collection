import { QueryClient, QueryFunction } from "@tanstack/react-query";

export const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || "http://localhost:8000";

export function getAssetUrl(path: string | null | undefined): string {
  if (!path) return `${(import.meta as any).env?.BASE_URL || "/"}placeholders/placeholder.png`;
  if (path.startsWith("http")) return path;

  // Remove leading slash if present to avoid double slashes with BASE_URL
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;

  // BASE_URL usually ends with a slash, e.g., "/Renu_Collections/"
  const baseUrl = (import.meta as any).env?.BASE_URL || "/";

  return `${baseUrl}${normalizedPath}`;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let errorText = res.statusText;
    try {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.clone().json();
        // Prefer structured error fields when available
        errorText = (data && (data.error || data.detail || data.message)) ?? JSON.stringify(data);
      } else {
        errorText = (await res.text()) || res.statusText;
      }
    } catch (_) {
      try {
        errorText = (await res.text()) || res.statusText;
      } catch (_) {
        // fall back to status text
        errorText = res.statusText;
      }
    }
    throw new Error(`${res.status}: ${errorText}`);
  }
}

// Refresh queue to prevent multiple simultaneous refresh requests
let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  // If a refresh is already in progress, wait for it
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) return false;
      const json = await response.json();
      if (json.success && json.data?.accessToken && json.data?.user) {
        localStorage.setItem('authToken', json.data.accessToken);
        localStorage.setItem('authUser', JSON.stringify(json.data.user));
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const fullUrl = `${API_BASE_URL}${url}`;

  const getHeaders = (token?: string | null): HeadersInit => {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  const makeRequest = async (token?: string | null): Promise<Response> => {
    const headers = getHeaders(token);

    if (method !== 'GET') {
      const csrfToken = document.cookie.split('; ').find(row => row.startsWith('csrftoken='))?.split('=')[1];
      if (csrfToken) {
        (headers as any)['X-CSRFToken'] = csrfToken;
      }
    }

    return fetch(fullUrl, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });
  };

  let token = localStorage.getItem('authToken');
  let res = await makeRequest(token);

  // If 401, try to refresh token and retry once
  if (res.status === 401 && token) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      token = localStorage.getItem('authToken');
      res = await makeRequest(token);
    } else {
      // Refresh failed, clear auth state
      localStorage.removeItem('authToken');
      localStorage.removeItem('authUser');
      // Redirect to login on next navigation
      window.location.href = '/login';
      throw new Error('Session expired. Please login again.');
    }
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    let token = localStorage.getItem('authToken');
    const getHeaders = (tok?: string | null): HeadersInit => {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      if (tok) {
        headers['Authorization'] = `Bearer ${tok}`;
      }
      return headers;
    };

    const makeRequest = async (tok?: string | null): Promise<Response> => {
      return fetch(`${API_BASE_URL}${queryKey.join("/")}`, {
        headers: getHeaders(tok),
        credentials: "include",
      });
    };

    let res = await makeRequest(token);

    // If 401, try to refresh token and retry once
    if (res.status === 401 && token) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        token = localStorage.getItem('authToken');
        res = await makeRequest(token);
      } else {
        // Refresh failed, clear auth state
        localStorage.removeItem('authToken');
        localStorage.removeItem('authUser');
        if (unauthorizedBehavior === "returnNull") {
          return null;
        }
        throw new Error('Session expired. Please login again.');
      }
    }

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "returnNull" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
