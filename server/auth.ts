// Sign up, log in, recovery code, log out, delete account.
import { getDb } from './db.js';
import { HttpError, clearCookie, json, readJson, requireUser, startSession } from './http.js';
import {
  cleanName, hashPassword, hashRecoveryCode, nameKey, nameProblem, newRecoveryCode, normalizeCode, passwordProblem, verifyPassword,
} from './security.js';

const MAX_FAILS = 8;
const LOCK_MINUTES = 15;

export const NAME_TAKEN = 'This name already exists, sign up with a different name';

export async function nameAvailable(req: Request): Promise<Response> {
  const name = new URL(req.url).searchParams.get('name') ?? '';
  const problem = nameProblem(name);
  if (problem) return json({ available: false, reason: problem });
  const db = await getDb();
  const rows = await db.query('select 1 from rf_users where name_key = $1', [nameKey(name)]);
  return json(rows.length ? { available: false, reason: NAME_TAKEN, taken: true } : { available: true });
}

export async function signup(req: Request): Promise<Response> {
  const body = await readJson<{ name?: string; password?: string }>(req, 10_000);
  const name = cleanName(body.name ?? '');
  const problem = nameProblem(name) ?? passwordProblem(body.password ?? '');
  if (problem) throw new HttpError(400, problem);

  const recoveryCode = newRecoveryCode();
  const [passwordHash] = await Promise.all([hashPassword(body.password!)]);
  const db = await getDb();
  return db.tx(async (q) => {
    const rows = await q.query(
      `insert into rf_users (name, name_key, password_hash, recovery_hash) values ($1, $2, $3, $4)
       on conflict (name_key) do nothing returning id, name`,
      [name, nameKey(name), passwordHash, hashRecoveryCode(recoveryCode)],
    );
    if (!rows.length) throw new HttpError(409, NAME_TAKEN, 'name_taken');
    const user = rows[0];
    await q.query('insert into rf_user_state (user_id) values ($1)', [user.id]);
    const cookie = await startSession(q, req, user.id);
    return json({ user: { id: user.id, name: user.name }, recoveryCode }, 201, { 'set-cookie': cookie });
  });
}

async function findUserForLogin(name: string) {
  const db = await getDb();
  const rows = await db.query(
    `select id, name, password_hash, recovery_hash, failed_attempts,
            (locked_until is not null and locked_until > now()) as locked
     from rf_users where name_key = $1`,
    [nameKey(name)],
  );
  if (!rows.length) throw new HttpError(404, 'No account with this name. Check the spelling or sign up.', 'no_user');
  const u = rows[0];
  if (u.locked) throw new HttpError(429, `Too many wrong tries. Try again in ${LOCK_MINUTES} minutes.`, 'locked');
  return u;
}

async function recordFail(userId: string) {
  const db = await getDb();
  await db.query(
    `update rf_users set failed_attempts = failed_attempts + 1,
       locked_until = case when failed_attempts + 1 >= $2 then now() + ($3 || ' minutes')::interval else locked_until end
     where id = $1`,
    [userId, MAX_FAILS, String(LOCK_MINUTES)],
  );
}

export async function login(req: Request): Promise<Response> {
  const body = await readJson<{ name?: string; password?: string }>(req, 10_000);
  if (!cleanName(body.name ?? '') || !body.password) throw new HttpError(400, 'Enter your name and password');
  const u = await findUserForLogin(body.name!);
  if (!(await verifyPassword(body.password, u.password_hash))) {
    await recordFail(u.id);
    throw new HttpError(401, 'Wrong password for this name', 'wrong_password');
  }
  const db = await getDb();
  return db.tx(async (q) => {
    await q.query('update rf_users set failed_attempts = 0, locked_until = null where id = $1', [u.id]);
    const cookie = await startSession(q, req, u.id);
    return json({ user: { id: u.id, name: u.name } }, 200, { 'set-cookie': cookie });
  });
}

/**
 * Log in with the one-time recovery code and set a new password.
 * The used code stops working and a new code is given back (shown once).
 */
export async function recover(req: Request): Promise<Response> {
  const body = await readJson<{ name?: string; code?: string; newPassword?: string }>(req, 10_000);
  if (!cleanName(body.name ?? '') || !body.code) throw new HttpError(400, 'Enter your name and recovery code');
  const problem = passwordProblem(body.newPassword ?? '');
  if (problem) throw new HttpError(400, problem);
  const u = await findUserForLogin(body.name!);
  if (normalizeCode(body.code).length !== 16 || hashRecoveryCode(body.code) !== u.recovery_hash) {
    await recordFail(u.id);
    throw new HttpError(401, 'This recovery code is not correct (or was already used)', 'wrong_code');
  }
  const recoveryCode = newRecoveryCode();
  const passwordHash = await hashPassword(body.newPassword!);
  const db = await getDb();
  return db.tx(async (q) => {
    // only succeeds if the code wasn't used in the meantime
    const rows = await q.query(
      `update rf_users set password_hash = $2, recovery_hash = $3, failed_attempts = 0, locked_until = null
       where id = $1 and recovery_hash = $4 returning id, name`,
      [u.id, passwordHash, hashRecoveryCode(recoveryCode), u.recovery_hash],
    );
    if (!rows.length) throw new HttpError(401, 'This recovery code was already used', 'wrong_code');
    const cookie = await startSession(q, req, u.id);
    return json({ user: { id: u.id, name: u.name }, recoveryCode }, 200, { 'set-cookie': cookie });
  });
}

export async function me(req: Request): Promise<Response> {
  let u;
  try {
    u = await requireUser(req);
  } catch (e) {
    // Not logged in is a normal answer here, not an error.
    if (e instanceof HttpError && e.status === 401) return json({ user: null });
    throw e;
  }
  // Renew the cookie so the device stays logged in for good.
  const { sessionCookie } = await import('./http.js');
  return json({ user: { id: u.id, name: u.name } }, 200, { 'set-cookie': sessionCookie(req, u.token) });
}

export async function logout(req: Request): Promise<Response> {
  await readJson(req, 1000);
  try {
    const u = await requireUser(req);
    const db = await getDb();
    await db.query('delete from rf_sessions where token_hash = $1', [u.tokenHash]);
  } catch (e) {
    if (!(e instanceof HttpError)) throw e; // already logged out is fine
  }
  return json({ ok: true }, 200, { 'set-cookie': clearCookie(req) });
}

/** Make a new recovery code (needs the password). The old code stops working. */
export async function newCode(req: Request): Promise<Response> {
  const body = await readJson<{ password?: string }>(req, 10_000);
  const u = await requireUser(req);
  const db = await getDb();
  const [row] = await db.query('select password_hash from rf_users where id = $1', [u.id]);
  if (!body.password || !(await verifyPassword(body.password, row.password_hash))) throw new HttpError(401, 'Wrong password', 'wrong_password');
  const recoveryCode = newRecoveryCode();
  await db.query('update rf_users set recovery_hash = $2 where id = $1', [u.id, hashRecoveryCode(recoveryCode)]);
  return json({ recoveryCode });
}

/** Delete the account and all its plans (needs the password). */
export async function deleteAccount(req: Request): Promise<Response> {
  const body = await readJson<{ password?: string }>(req, 10_000);
  const u = await requireUser(req);
  const db = await getDb();
  const [row] = await db.query('select password_hash from rf_users where id = $1', [u.id]);
  if (!body.password || !(await verifyPassword(body.password, row.password_hash))) throw new HttpError(401, 'Wrong password', 'wrong_password');
  await db.query('delete from rf_users where id = $1', [u.id]);
  return json({ ok: true }, 200, { 'set-cookie': clearCookie(req) });
}
