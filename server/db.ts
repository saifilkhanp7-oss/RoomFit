// Database access for the backend.
// - On Vercel: connects to Supabase Postgres using DATABASE_URL (or POSTGRES_URL from the
//   Vercel ↔ Supabase integration).
// - On your computer with no DATABASE_URL: uses PGlite, a real Postgres that runs inside
//   Node and saves to the .localdb folder, so `npm run dev` works without any setup.
import { SCHEMA_SQL } from './schemaSql.js';

export type Row = Record<string, any>;
export interface Queryable {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
}
export interface Db extends Queryable {
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
}

let dbPromise: Promise<Db> | null = null;

export function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = createDb().catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

/** For tests: use a given database instead. */
export function setDb(db: Db | null) {
  dbPromise = db ? Promise.resolve(db) : null;
}

function connectionString(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}

async function createDb(): Promise<Db> {
  const url = connectionString();
  const db = url ? await pgDb(url) : await localDb();
  await db.query(SCHEMA_SQL);
  return db;
}

async function pgDb(url: string): Promise<Db> {
  const { default: pg } = await import('pg');
  // Supabase needs SSL. Its certificate chain isn't in Node's default list, so we keep the
  // connection encrypted but don't verify the chain (the standard setup for Supabase + pg).
  const u = new URL(url);
  u.searchParams.delete('sslmode');
  const local = ['localhost', '127.0.0.1'].includes(u.hostname);
  const pool = new pg.Pool({
    connectionString: u.toString(),
    ssl: local ? undefined : { rejectUnauthorized: false },
    max: 1, // serverless: one connection per function instance (use Supabase's pooler URL)
    idleTimeoutMillis: 10_000,
  });
  const run = async (client: { query: (s: string, p?: unknown[]) => Promise<{ rows: any[] }> }, sql: string, params?: unknown[]) =>
    (await client.query(sql, params)).rows;
  return {
    query: (sql, params) => run(pool, sql, params),
    tx: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const out = await fn({ query: (sql, params) => run(client, sql, params) });
        await client.query('commit');
        return out;
      } catch (e) {
        await client.query('rollback').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

async function localDb(dataDir: string | undefined = process.env.VERCEL ? undefined : './.localdb'): Promise<Db> {
  if (process.env.VERCEL) {
    throw new Error('DATABASE_URL is not set. Add your Supabase connection string in Vercel → Settings → Environment Variables.');
  }
  return pgliteDb(dataDir);
}

/** PGlite database (local dev + tests). Pass no dir for in-memory. */
export async function pgliteDb(dataDir?: string): Promise<Db> {
  // module name in a variable so Vercel's bundler doesn't pack PGlite into the functions
  const mod = '@electric-sql/pglite';
  const { PGlite } = await import(/* @vite-ignore */ mod);
  const pg = new PGlite(dataDir);
  await pg.waitReady;
  // PGlite runs one statement at a time; queue calls so a transaction isn't interleaved.
  let chain: Promise<unknown> = Promise.resolve();
  const queued = <T>(fn: () => Promise<T>): Promise<T> => {
    const p = chain.then(fn, fn);
    chain = p.catch(() => {});
    return p;
  };
  const run = async (target: any, sql: string, params?: unknown[]) =>
    params?.length ? (await target.query(sql, params)).rows : multi(await target.exec(sql));
  const multi = (results: any[]) => (results.length ? results[results.length - 1].rows : []);
  return {
    query: (sql, params) => queued(() => run(pg, sql, params)),
    tx: (fn) => queued(() => pg.transaction((tx: any) => fn({ query: (sql, params) => run(tx, sql, params) }))),
  };
}
