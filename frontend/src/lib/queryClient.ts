import { QueryClient, QueryFunction } from "@tanstack/react-query";

const rawApiUrl = (import.meta as any).env?.VITE_API_BASE_URL || "http://localhost:8000";
// Normalize if the frontend static site host (renu-s-collection-6lui) was mistakenly configured as the API base
export const API_BASE_URL = rawApiUrl.replace("renu-s-collection-6lui.onrender.com", "renu-s-collection.onrender.com");

export function getAssetUrl(path: string | null | undefined): string {
  if (!path) return `${(import.meta as any).env?.BASE_URL || "/"}placeholders/placeholder.png`;
  
  // If an existing stored path already had the frontend static host baked in with -6lui:
  if (path.includes("renu-s-collection-6lui.onrender.com/api/")) {
    return path.replace("renu-s-collection-6lui.onrender.com", "renu-s-collection.onrender.com");
  }

  if (path.startsWith("http://") || path.startsWith("https://")) return path;

  // If the path points to an API route (e.g. /api/v1/products/images/:id or api/v1/...),
  // route it to the backend API host (API_BASE_URL), avoiding frontend static host 404s
  if (path.startsWith("/api/") || path.startsWith("api/")) {
    const normalizedApi = path.startsWith("/") ? path : `/${path}`;
    const baseApi = API_BASE_URL.replace(/\/+$/, "");
    return `${baseApi}${normalizedApi}`;
  }

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

export function formatApiErrorMessage(error: any): string {
  if (!error) return "An unexpected error occurred. Please try again.";
  let msg = typeof error === "string" ? error : error?.message || String(error);

  // Strip HTTP status prefix if present, e.g. "409: Product slug already exists"
  msg = msg.replace(/^\d{3}:\s*/, "").trim();

  // If error text is wrapped in JSON, parse it
  if (msg.startsWith("{") && msg.endsWith("}")) {
    try {
      const parsed = JSON.parse(msg);
      msg = parsed.message || parsed.error || (parsed.errors ? Object.values(parsed.errors).flat().join(", ") : msg);
    } catch {
      // ignore
    }
  }

  const lower = msg.toLowerCase();
  if (lower.includes("product slug already exists") || lower.includes("slug already exists")) {
    return "A product with this name already exists. Please choose a slightly different name so it has a unique web address.";
  }
  if (lower.includes("sku already exists")) {
    return "A product with this SKU code already exists. Please enter a unique SKU.";
  }
  if (lower.includes("category slug already exists") || lower.includes("category already exists")) {
    return "A category with this name already exists. Please enter a unique category name.";
  }
  if (lower.includes("category not found")) {
    return "The selected category could not be found. Please select a valid category.";
  }
  if (lower.includes("authentication required") || lower.includes("invalid or expired access token")) {
    return "Your session has expired. Please log in again to continue.";
  }

  return msg;
}

// Refresh queue to prevent multiple simultaneous refresh requests
let refreshPromise: Promise<boolean> | null = null;

export async function refreshAccessToken(): Promise<boolean> {
  // If a refresh is already in progress, wait for it
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const storedRefreshToken = localStorage.getItem('authRefreshToken');
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(storedRefreshToken ? { 'x-refresh-token': storedRefreshToken } : {}),
        },
        body: JSON.stringify({ refreshToken: storedRefreshToken || undefined }),
        credentials: 'include',
      });
      if (!response.ok) {
        const hadCredentials = Boolean(localStorage.getItem('authToken') || storedRefreshToken);
        if (hadCredentials) {
          localStorage.removeItem('authToken');
          localStorage.removeItem('authUser');
          localStorage.removeItem('authRefreshToken');
          window.dispatchEvent(
            new CustomEvent('auth:session_restored', { detail: { token: null, user: null } })
          );
        }
        return false;
      }
      const json = await response.json();
      if (json.success && json.data?.accessToken && json.data?.user) {
        localStorage.setItem('authToken', json.data.accessToken);
        localStorage.setItem('authUser', JSON.stringify(json.data.user));
        if (json.data.refreshToken) {
          localStorage.setItem('authRefreshToken', json.data.refreshToken);
        }
        window.dispatchEvent(
          new CustomEvent('auth:session_restored', {
            detail: { token: json.data.accessToken, user: json.data.user },
          })
        );
        return true;
      }
      localStorage.removeItem('authToken');
      localStorage.removeItem('authUser');
      localStorage.removeItem('authRefreshToken');
      window.dispatchEvent(
        new CustomEvent('auth:session_restored', { detail: { token: null, user: null } })
      );
      return false;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function uploadImageFile(
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  const validTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!validTypes.includes(file.type)) {
    throw new Error("Invalid format. Please select a JPEG, PNG, or WebP image.");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("File is too large. Image size must be under 10MB.");
  }

  const uploadFormData = new FormData();
  uploadFormData.append("images", file);

  const doUpload = (authToken: string | null): Promise<any> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_BASE_URL}/api/v1/products/images/upload`);
      xhr.withCredentials = true;

      if (authToken) {
        xhr.setRequestHeader("Authorization", `Bearer ${authToken}`);
      }

      if (onProgress) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            onProgress(percent);
          }
        };
      }

      xhr.onload = () => {
        let json: any = null;
        try {
          json = JSON.parse(xhr.responseText);
        } catch (_) {}

        if (xhr.status >= 200 && xhr.status < 300 && json?.success) {
          resolve(json);
        } else {
          const msg =
            json?.message ||
            json?.error ||
            `Upload failed with HTTP status ${xhr.status}`;
          reject(new Error(msg));
        }
      };

      xhr.onerror = () => {
        reject(new Error("Network error during image upload. Check server connection."));
      };

      xhr.send(uploadFormData);
    });
  };

  let token = localStorage.getItem("authToken");
  let result: any;
  try {
    result = await doUpload(token);
  } catch (err: any) {
    if (err?.message?.includes("401") || err?.message?.includes("Authentication")) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        token = localStorage.getItem("authToken");
        result = await doUpload(token);
      } else {
        throw err;
      }
    } else {
      throw err;
    }
  }

  const uploaded = result.data?.[0];
  if (!uploaded?.url) {
    throw new Error("No image URL returned from upload server.");
  }
  return uploaded.url;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const fullUrl = `${API_BASE_URL}${url}`;

  // If a token refresh is currently in progress, wait for it before proceeding
  if (refreshPromise && !url.includes('/api/v1/auth/')) {
    await refreshPromise;
  }

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
      cache: "no-store",
    });
  };

  let token = localStorage.getItem('authToken');
  let res = await makeRequest(token);

  // If 401 and not an auth endpoint, try to refresh token and retry once
  if (res.status === 401 && !url.includes('/api/v1/auth/')) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      token = localStorage.getItem('authToken');
      res = await makeRequest(token);
    } else {
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
    const path = queryKey.join("/");
    // If a token refresh is in progress, wait for it before proceeding
    if (refreshPromise && !path.includes("auth/")) {
      await refreshPromise;
    }

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
      return fetch(`${API_BASE_URL}${path}`, {
        headers: getHeaders(tok),
        credentials: "include",
      });
    };

    let res = await makeRequest(token);

    // If 401 and not an auth endpoint, try to refresh token and retry once
    if (res.status === 401 && !path.includes("auth/")) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        token = localStorage.getItem('authToken');
        res = await makeRequest(token);
      } else {
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
