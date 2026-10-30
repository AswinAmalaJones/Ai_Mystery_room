const configuredBase = import.meta.env.VITE_API_BASE_URL;

// If VITE_API_BASE_URL is specified (e.g. decoupled frontend/backend), use it.
// In local dev, default to 'http://localhost:5000/api/v1'.
// In production without an explicit URL, use relative '/api/v1' so it seamlessly
// works on the same domain or behind a reverse proxy/rewrite without CORS issues.
const base = (configuredBase && configuredBase.trim() !== '')
  ? configuredBase.replace(/\/+$/, '')
  : (import.meta.env.DEV ? 'http://localhost:5000/api/v1' : '/api/v1');

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const response = await fetch(`${base}${cleanPath}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error?.message || 'Connection issue. Check your internet and try again.');
  }

  return body.data as T;
}
