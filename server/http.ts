// Small helpers for the API functions (Web Request/Response, as used by Vercel Functions).
import { getDb, type Queryable } from './db.js';
import { newDeviceToken, sha256 } from './security.js';

export const COOKIE = 'rf_session';
/** Browsers cap cookies at ~400 days; we renew it every time the app is opened, so it lasts for good. */
const COOKIE_MAX_AGE = 400 * 24 * 3600;

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

/** Wrap a handler: turns thrown HttpErrors into JSON errors and hides internal errors. */
export function handler(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, code: e.code }, e.status);
      console.error(e);
      return json({ error: 'Something went wrong on the server. Please try again.' }, 500);
    }
  };
}

/** Read a JSON body. Also blocks cross-site form posts (they can't send this header). */
export async function readJson<T = any>(req: Request, maxBytes = 1_000_000): Promise<T> {
  if (req.headers.get('x-roomfit') !== '1') throw new HttpError(403, 'Bad request');
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > maxBytes) throw new HttpError(413, 'Request is too big');
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'Request is too big');
  try {
    return JSON.parse(text || '{}');
  } catch {
    throw new HttpError(400, 'Bad request');
  }
}

export function getCookie(req: Request, name: string): string | null {
  const raw = req.headers.get('cookie') ?? '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function isHttps(req: Request) {
  const proto = req.headers.get('x-forwarded-proto') ?? new URL(req.url).protocol.replace(':', '');
  return proto === 'https';
}

export function sessionCookie(req: Request, token: string): string {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${isHttps(req) ? '; Secure' : ''}`;
}

export function clearCookie(req: Request): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isHttps(req) ? '; Secure' : ''}`;
}

/** Start a "lifetime" session on this device. Returns the Set-Cookie header value. */
export async function startSession(q: Queryable, req: Request, userId: string): Promise<string> {
  const token = newDeviceToken();
  await q.query('insert into rf_sessions (token_hash, user_id, user_agent) values ($1, $2, $3)', [
    sha256(token),
    userId,
    (req.headers.get('user-agent') ?? '').slice(0, 200),
  ]);
  return sessionCookie(req, token);
}

export interface SessionUser {
  id: string;
  name: string;
  tokenHash: string;
  token: string;
}

/** The logged-in user for this request, or a 401 error. */
export async function requireUser(req: Request): Promise<SessionUser> {
  const token = getCookie(req, COOKIE);
  if (!token) throw new HttpError(401, 'Please log in', 'not_logged_in');
  const db = await getDb();
  const tokenHash = sha256(token);
  const rows = await db.query(
    `update rf_sessions s set last_seen_at = now() from rf_users u
     where s.token_hash = $1 and u.id = s.user_id
     returning u.id, u.name`,
    [tokenHash],
  );
  if (!rows.length) throw new HttpError(401, 'Please log in', 'not_logged_in');
  return { id: rows[0].id, name: rows[0].name, tokenHash, token };
}
