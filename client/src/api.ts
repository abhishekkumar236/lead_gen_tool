export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

/**
 * True when a request was superseded by a newer one. Pages fire a fresh fetch on
 * every filter/section change, and without cancelling, a slow earlier response
 * can land after a fast later one and overwrite the screen with stale rows.
 */
export function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}
