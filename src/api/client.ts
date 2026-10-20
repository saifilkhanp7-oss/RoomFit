// Talks to the backend (the api/ folder, running on Vercel).

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
  get offline() {
    return this.status === 0;
  }
}

export async function api<T = any>(path: string, opts: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined ? 'POST' : 'GET');
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: method === 'POST' ? { 'content-type': 'application/json', 'x-roomfit': '1' } : {},
      body: method === 'POST' ? JSON.stringify(opts.body ?? {}) : undefined,
    });
  } catch {
    throw new ApiError(0, "You're offline. Connect to the internet and try again.", 'offline');
  }
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? (res.status >= 500 ? 'The server had a problem. Please try again.' : 'Something went wrong.'), data?.code);
  }
  return data as T;
}

export interface User {
  id: string;
  name: string;
}

export const authApi = {
  nameAvailable: (name: string) => api<{ available: boolean; reason?: string; taken?: boolean }>(`/api/auth/name?name=${encodeURIComponent(name)}`),
  signup: (name: string, password: string) => api<{ user: User; recoveryCode: string }>('/api/auth/signup', { body: { name, password } }),
  login: (name: string, password: string) => api<{ user: User }>('/api/auth/login', { body: { name, password } }),
  recover: (name: string, code: string, newPassword: string) =>
    api<{ user: User; recoveryCode: string }>('/api/auth/recover', { body: { name, code, newPassword } }),
  me: () => api<{ user: User | null }>('/api/auth/me'),
  logout: () => api('/api/auth/logout', { body: {} }),
  newRecoveryCode: (password: string) => api<{ recoveryCode: string }>('/api/auth/recovery-code', { body: { password } }),
  deleteAccount: (password: string) => api('/api/account', { body: { password } }),
};
