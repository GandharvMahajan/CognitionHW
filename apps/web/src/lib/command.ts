'use client';

export interface CommandResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Submits a command to the API. The browser never mutates domain state directly:
 * every action posts an intent and the server owns the decision.
 */
export async function submitCommand<T = unknown>(
  path: string,
  body: unknown = {},
): Promise<CommandResult<T>> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });

  if (res.status === 204) return { ok: true, status: res.status };

  const payload = (await res.json().catch(() => null)) as
    | { error?: { code?: string; message?: string } }
    | T
    | null;

  if (!res.ok) {
    const error = (payload as { error?: { code?: string; message?: string } } | null)?.error;
    return {
      ok: false,
      status: res.status,
      errorCode: error?.code ?? 'INTERNAL_ERROR',
      errorMessage: error?.message ?? 'Something went wrong',
    };
  }

  return { ok: true, status: res.status, data: (payload ?? undefined) as T };
}
