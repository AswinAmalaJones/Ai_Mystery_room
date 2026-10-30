const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${base}${path}`, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...options.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || 'Connection issue. Check your internet and try again.');
  return body.data as T;
}
