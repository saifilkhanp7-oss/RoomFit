// Passwords, recovery codes, device tokens and name rules.
import { createHash, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function scrypt(password: string, salt: Buffer, N: number, r: number, p: number, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password.normalize('NFKC'), salt, keylen, { N, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** Slow, salted hash for passwords: "scrypt$N$r$p$salt$hash". */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const { N, r, p, keylen } = SCRYPT;
  const key = await scrypt(password, salt, N, r, p, keylen);
  return ['scrypt', N, r, p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, N, r, p, saltB64, keyB64] = stored.split('$');
  if (algo !== 'scrypt' || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), +N, +r, +p, expected.length);
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

// ---------- recovery code ----------
// 16 characters without look-alikes (no 0/O, 1/I/L, U/V), shown as XXXX-XXXX-XXXX-XXXX (~78 bits).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTWXYZ23456789';

export function newRecoveryCode(): string {
  let s = '';
  for (let i = 0; i < 16; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s.match(/.{4}/g)!.join('-');
}

/** Ignore spaces, dashes and case when the user types the code. */
export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export const hashRecoveryCode = (code: string) => sha256('rf-recovery:' + normalizeCode(code));

// ---------- device token ----------
export function newDeviceToken(): string {
  return randomBytes(32).toString('base64url');
}

// ---------- names ----------
export const NAME_MIN = 3;
export const NAME_MAX = 24;
export const PASSWORD_MIN = 8;

/** Clean up a name: trim and collapse spaces. */
export function cleanName(name: string): string {
  return String(name ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
}

/** Key used to check if a name is taken: "Saif Khan", "saif  khan" and "SAIF KHAN" are the same. */
export function nameKey(name: string): string {
  return cleanName(name).toLowerCase();
}

/** Returns an error message, or null if the name is allowed. */
export function nameProblem(name: string): string | null {
  const n = cleanName(name);
  if (n.length < NAME_MIN) return `Name must be at least ${NAME_MIN} characters`;
  if (n.length > NAME_MAX) return `Name can be at most ${NAME_MAX} characters`;
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(n)) return 'Use only letters, numbers, spaces, dot, dash or underscore';
  return null;
}

export function passwordProblem(pw: string): string | null {
  if (typeof pw !== 'string' || pw.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters`;
  if (pw.length > 200) return 'Password is too long';
  return null;
}
