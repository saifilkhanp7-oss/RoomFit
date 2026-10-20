// Cloud sync for plans: each device sends what changed and gets back what changed elsewhere.
// Conflicts: the newest change (by the time it was made) wins, per home.
import { getDb } from './db.js';
import { HttpError, json, readJson, requireUser } from './http.js';
import { sanitizeHome, sanitizeTemplate } from '../src/storage/sanitize.js';

const MAX_HOMES_PER_REQUEST = 200;
const MAX_HOME_BYTES = 1_500_000;

interface IncomingHome {
  id: string;
  data?: unknown;
  deleted?: boolean;
  updatedAt: number;
}

export async function sync(req: Request): Promise<Response> {
  const user = await requireUser(req);
  const body = await readJson<{ since?: number; homes?: IncomingHome[]; templates?: { data: unknown[]; updatedAt: number } }>(req, 4_000_000);
  const since = Number.isFinite(body.since) ? Number(body.since) : 0;
  const incoming = Array.isArray(body.homes) ? body.homes : [];
  if (incoming.length > MAX_HOMES_PER_REQUEST) throw new HttpError(413, 'Too many changes at once');

  const db = await getDb();
  return db.tx(async (q) => {
    for (const h of incoming) {
      if (typeof h?.id !== 'string' || !h.id || h.id.length > 40) throw new HttpError(400, 'Bad home id');
      const updatedAt = Number(h.updatedAt);
      if (!Number.isFinite(updatedAt) || updatedAt <= 0) throw new HttpError(400, 'Bad time');
      let data: unknown = null;
      if (!h.deleted) {
        const clean = sanitizeHome({ ...(h.data as object), id: h.id });
        if (!clean) throw new HttpError(400, 'Bad plan data');
        clean.updatedAt = updatedAt;
        const text = JSON.stringify(clean);
        if (text.length > MAX_HOME_BYTES) throw new HttpError(413, `"${clean.name}" is too big to save`);
        data = text;
      }
      // Insert, or replace only if this change is newer than what the server has.
      await q.query(
        `insert into rf_homes (user_id, id, data, deleted, updated_at) values ($1, $2, $3::jsonb, $4, $5)
         on conflict (user_id, id) do update
           set data = excluded.data, deleted = excluded.deleted, updated_at = excluded.updated_at, rev = nextval('rf_rev')
           where rf_homes.updated_at < excluded.updated_at`,
        [user.id, h.id, data, !!h.deleted, updatedAt],
      );
    }

    if (body.templates && Array.isArray(body.templates.data) && Number.isFinite(body.templates.updatedAt)) {
      const t = body.templates.data.map(sanitizeTemplate).filter(Boolean).slice(0, 100);
      await q.query(
        `insert into rf_user_state (user_id, templates, updated_at) values ($1, $2::jsonb, $3)
         on conflict (user_id) do update set templates = excluded.templates, updated_at = excluded.updated_at, rev = nextval('rf_rev')
         where rf_user_state.updated_at < excluded.updated_at`,
        [user.id, JSON.stringify(t), body.templates.updatedAt],
      );
    }

    const homes = await q.query(
      `select id, data, deleted, updated_at::float8 as "updatedAt", rev::float8 as rev
       from rf_homes where user_id = $1 and rev > $2 order by rev`,
      [user.id, since],
    );
    const state = await q.query(
      `select templates, updated_at::float8 as "updatedAt", rev::float8 as rev from rf_user_state where user_id = $1 and rev > $2`,
      [user.id, since],
    );
    const [{ max }] = await q.query(
      `select greatest(
         coalesce((select max(rev) from rf_homes where user_id = $1), 0),
         coalesce((select max(rev) from rf_user_state where user_id = $1), 0))::float8 as max`,
      [user.id],
    );
    return json({
      since: Math.max(since, Number(max) || 0),
      homes: homes.map((h) => ({ id: h.id, deleted: h.deleted, updatedAt: h.updatedAt, data: h.deleted ? null : h.data })),
      templates: state[0] ? { data: state[0].templates, updatedAt: state[0].updatedAt } : undefined,
    });
  });
}
