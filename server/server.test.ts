import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { pgliteDb, setDb } from './db.js';
import { SCHEMA_SQL } from './schemaSql.js';
import { GET as nameGET } from '../api/auth/name.js';
import { POST as signupPOST } from '../api/auth/signup.js';
import { POST as loginPOST } from '../api/auth/login.js';
import { POST as recoverPOST } from '../api/auth/recover.js';
import { GET as meGET } from '../api/auth/me.js';
import { POST as logoutPOST } from '../api/auth/logout.js';
import { POST as accountPOST } from '../api/account.js';
import { POST as syncPOST } from '../api/sync.js';
import { POST as codePOST } from '../api/auth/recovery-code.js';
import { makeHome } from '../src/model/defaults.js';

const BASE = 'https://roomfit.test';
const post = (path: string, body: unknown, cookie?: string, extra: Record<string, string> = {}) =>
  new Request(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-roomfit': '1', 'x-forwarded-proto': 'https', ...(cookie ? { cookie } : {}), ...extra },
    body: JSON.stringify(body),
  });
const get = (path: string, cookie?: string) => new Request(BASE + path, { headers: cookie ? { cookie } : {} });
const cookieOf = (res: Response) => (res.headers.get('set-cookie') ?? '').split(';')[0];

beforeAll(async () => {
  const db = await pgliteDb();
  await db.query(SCHEMA_SQL);
  setDb(db);
}, 60_000);

describe('schema', () => {
  it('schema.sql and schemaSql.ts match', () => {
    expect(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8')).toBe(SCHEMA_SQL);
  });
});

describe('sign up and log in', () => {
  let cookie = '';
  let code = '';

  it('name is free, then sign up', async () => {
    expect(await (await nameGET(get('/api/auth/name?name=Saif'))).json()).toEqual({ available: true });
    const res = await signupPOST(post('/api/auth/signup', { name: '  Saif ', password: 'secret123' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user.name).toBe('Saif');
    expect(body.recoveryCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    cookie = cookieOf(res);
    code = body.recoveryCode;
    expect(res.headers.get('set-cookie')).toContain('HttpOnly');
    expect(res.headers.get('set-cookie')).toContain('Secure');
    expect(res.headers.get('set-cookie')).toMatch(/Max-Age=\d{8}/);
  });

  it('same name (any case/spaces) is taken', async () => {
    const r = await (await nameGET(get('/api/auth/name?name=SAIF'))).json();
    expect(r.available).toBe(false);
    expect(r.reason).toBe('This name already exists, sign up with a different name');
    const res = await signupPOST(post('/api/auth/signup', { name: 'saif', password: 'otherpass1' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('This name already exists, sign up with a different name');
  });

  it('rejects bad names and short passwords', async () => {
    expect((await signupPOST(post('/api/auth/signup', { name: 'ab', password: 'secret123' }))).status).toBe(400);
    expect((await signupPOST(post('/api/auth/signup', { name: 'Riya', password: 'short' }))).status).toBe(400);
    expect((await signupPOST(post('/api/auth/signup', { name: '<script>', password: 'secret123' }))).status).toBe(400);
  });

  it('blocks requests without the app header (cross-site forms)', async () => {
    const res = await loginPOST(new Request(BASE + '/api/auth/login', { method: 'POST', body: JSON.stringify({ name: 'Saif', password: 'secret123' }) }));
    expect(res.status).toBe(403);
  });

  it('me works with the cookie and renews it', async () => {
    const res = await meGET(get('/api/auth/me', cookie));
    expect(res.status).toBe(200);
    expect((await res.json()).user.name).toBe('Saif');
    expect(res.headers.get('set-cookie')).toContain('rf_session=');
    expect(await (await meGET(get('/api/auth/me'))).json()).toEqual({ user: null });
    expect(await (await meGET(get('/api/auth/me', 'rf_session=fake'))).json()).toEqual({ user: null });
  });

  it('login: wrong password, unknown name, right password', async () => {
    const wrong = await loginPOST(post('/api/auth/login', { name: 'saif', password: 'nope12345' }));
    expect(wrong.status).toBe(401);
    expect((await wrong.json()).error).toBe('Wrong password for this name');
    const none = await loginPOST(post('/api/auth/login', { name: 'Nobody', password: 'secret123' }));
    expect(none.status).toBe(404);
    const ok = await loginPOST(post('/api/auth/login', { name: 'SAIF', password: 'secret123' }));
    expect(ok.status).toBe(200);
    expect(cookieOf(ok)).toMatch(/^rf_session=.{40,}/);
  });

  it('recovery code logs in on a new device, sets a new password, and works only once', async () => {
    const res = await recoverPOST(post('/api/auth/recover', { name: 'Saif', code: code.toLowerCase().replace(/-/g, ' '), newPassword: 'newpass123' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recoveryCode).not.toBe(code);
    const again = await recoverPOST(post('/api/auth/recover', { name: 'Saif', code, newPassword: 'another123' }));
    expect(again.status).toBe(401);
    expect((await loginPOST(post('/api/auth/login', { name: 'Saif', password: 'secret123' }))).status).toBe(401);
    expect((await loginPOST(post('/api/auth/login', { name: 'Saif', password: 'newpass123' }))).status).toBe(200);
    code = body.recoveryCode;
  });

  it('new recovery code needs the password', async () => {
    expect((await codePOST(post('/api/auth/recovery-code', { password: 'bad' }, cookie))).status).toBe(401);
    const r = await codePOST(post('/api/auth/recovery-code', { password: 'newpass123' }, cookie));
    expect(r.status).toBe(200);
    expect((await r.json()).recoveryCode).toMatch(/-/);
  });

  it('locks the name after many wrong tries', async () => {
    await signupPOST(post('/api/auth/signup', { name: 'Lock Test', password: 'secret123' }));
    for (let i = 0; i < 8; i++) await loginPOST(post('/api/auth/login', { name: 'Lock Test', password: 'wrong' + i + 'xxxx' }));
    const res = await loginPOST(post('/api/auth/login', { name: 'Lock Test', password: 'secret123' }));
    expect(res.status).toBe(429);
  });

  it('logout ends this device session', async () => {
    const ok = await loginPOST(post('/api/auth/login', { name: 'Saif', password: 'newpass123' }));
    const c = cookieOf(ok);
    expect((await meGET(get('/api/auth/me', c))).status).toBe(200);
    const out = await logoutPOST(post('/api/auth/logout', {}, c));
    expect(out.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await (await meGET(get('/api/auth/me', c))).json()).user).toBeNull();
    expect((await meGET(get('/api/auth/me', cookie))).status).toBe(200); // other device still logged in
  });
});

describe('sync', () => {
  let a = '';
  let b = '';
  beforeAll(async () => {
    a = cookieOf(await signupPOST(post('/api/auth/signup', { name: 'Sync A', password: 'secret123' })));
    b = cookieOf(await signupPOST(post('/api/auth/signup', { name: 'Sync B', password: 'secret123' })));
  });
  const home = (name: string) => makeHome({ name, kind: 'single', floorCount: 1, roomName: 'Bedroom', roomWidth: 3658, roomLength: 3048, unit: 'ft' });

  it('needs login', async () => {
    expect((await syncPOST(post('/api/sync', { since: 0 }))).status).toBe(401);
  });

  it('uploads, downloads on another device, newest change wins, deletes', async () => {
    const h = home('Hostel 204');
    const r1 = await (await syncPOST(post('/api/sync', { since: 0, homes: [{ id: h.id, data: h, updatedAt: 1000 }] }, a))).json();
    expect(r1.homes).toHaveLength(1);
    expect(r1.homes[0].data.name).toBe('Hostel 204');
    const s1 = r1.since;

    // "second device" of the same user pulls everything
    const pull = await (await syncPOST(post('/api/sync', { since: 0 }, a))).json();
    expect(pull.homes.map((x: any) => x.id)).toEqual([h.id]);

    // older change is ignored, newer change wins
    await syncPOST(post('/api/sync', { since: s1, homes: [{ id: h.id, data: { ...h, name: 'OLD' }, updatedAt: 500 }] }, a));
    const r2 = await (await syncPOST(post('/api/sync', { since: s1, homes: [{ id: h.id, data: { ...h, name: 'Newer' }, updatedAt: 2000 }] }, a))).json();
    expect(r2.homes[0].data.name).toBe('Newer');
    expect(r2.since).toBeGreaterThan(s1);

    // nothing new since last time
    const r3 = await (await syncPOST(post('/api/sync', { since: r2.since }, a))).json();
    expect(r3.homes).toHaveLength(0);

    // delete
    const r4 = await (await syncPOST(post('/api/sync', { since: r2.since, homes: [{ id: h.id, deleted: true, updatedAt: 3000 }] }, a))).json();
    expect(r4.homes[0]).toMatchObject({ id: h.id, deleted: true, data: null });
  });

  it('users never see each other’s plans', async () => {
    const hb = home('B home');
    await syncPOST(post('/api/sync', { since: 0, homes: [{ id: hb.id, data: hb, updatedAt: 1 }] }, b));
    const pullA = await (await syncPOST(post('/api/sync', { since: 0 }, a))).json();
    expect(pullA.homes.some((x: any) => x.data?.name === 'B home')).toBe(false);
    // same home id from another user does not overwrite
    await syncPOST(post('/api/sync', { since: 0, homes: [{ id: hb.id, data: { ...hb, name: 'Hacked' }, updatedAt: 99 }] }, a));
    const pullB = await (await syncPOST(post('/api/sync', { since: 0 }, b))).json();
    expect(pullB.homes.find((x: any) => x.id === hb.id).data.name).toBe('B home');
  });

  it('cleans bad data and syncs My items', async () => {
    const h = home('Dirty');
    (h as any).evil = '<script>';
    h.layouts[0].floors[0].items.push({ id: 'x', type: 'bed', label: 'Bed', x: 0, y: 0, width: 'NaN' as any, depth: 900, rotation: 0, shape: 'rect', color: 'javascript:alert(1)' });
    const r = await (await syncPOST(post('/api/sync', { since: 0, homes: [{ id: h.id, data: h, updatedAt: 5 }], templates: { data: [{ label: 'Guitar', width: 400, depth: 1000, shape: 'rect', color: '#ffffff' }], updatedAt: 10 } }, b))).json();
    const got = r.homes.find((x: any) => x.id === h.id).data;
    expect(got.evil).toBeUndefined();
    expect(got.layouts[0].floors[0].items[0].color).toBe('#9aa0a6');
    expect(got.layouts[0].floors[0].items[0].width).toBe(600);
    expect(r.templates.data[0].label).toBe('Guitar');
  });

  it('a bad plan does not stop the other plans from syncing', async () => {
    const good = home('Good one');
    const res = await syncPOST(post('/api/sync', { since: 0, homes: [{ id: 'broken', data: { name: 'x', layouts: 'nope' }, updatedAt: 7 }, { id: good.id, data: good, updatedAt: 7 }] }, a));
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r.rejected).toEqual([{ id: 'broken', reason: 'Bad plan data' }]);
    expect(r.homes.some((x: any) => x.id === good.id)).toBe(true);
  });

  it('keeps everything a plan can have (walls inside, costs, roommates, plugs, colours…)', async () => {
    const h = home('Full plan');
    const f = h.layouts[0].floors[0];
    const room = f.rooms[0];
    room.wallColor = '#d6e6f5';
    room.sideColors = { right: '#264653' };
    f.partitions = [{ id: 'p1', a: { x: 0, y: 1500 }, b: { x: 2000, y: 1500 }, thicknessMm: 114, bottomMm: 2134, color: '#fbe7c6' }];
    f.zones = [{ id: 'z1', personId: 'aman', x: 0, y: 0, width: 1500, length: 3000 }];
    f.points = [{ id: 'pt', roomId: room.id, side: 'left', offsetMm: 300, kind: 'power', heightMm: 2134 }];
    f.covers = [{ id: 'c1', x: 0, y: 0, width: 900, length: 900 }];
    f.items.push({ id: 'ac', type: 'ac', label: 'AC', x: 1800, y: 150, width: 965, depth: 229, rotation: 0, shape: 'rect', color: '#e6edf2', owner: 'aman', power: 'heavy', elevationMm: 2134 });
    h.people = [{ id: 'aman', name: 'Aman', color: '#e8590c' }];
    h.meId = 'aman';
    h.layouts[0].estimate = {
      currency: '₹',
      brick: { lengthMm: 229, widthMm: 114, heightMm: 76, jointMm: 10, price: 9, wastePct: 6 },
      walls: true,
      stairs: true,
      ceiling: false,
      ceilingMm: 125,
      tile: { lengthMm: 600, widthMm: 600, gapMm: 2, price: 99 },
      tileWastePct: 10,
      rooms: { [room.id]: { mode: 'none' } },
      paint: { coats: 3, coverageM2: 10, price: 300, ceiling: false, outside: true },
      cement: { price: 450, mortarMix: 5, plaster: true, plasterMix: 4, plasterMm: 15, plasterOutside: false, tileBed: false, tileBedMm: 20, tileBedMix: 4 },
    };
    const r = await (await syncPOST(post('/api/sync', { since: 0, homes: [{ id: h.id, data: h, updatedAt: 9 }] }, a))).json();
    const got = r.homes.find((x: any) => x.id === h.id).data;
    const gf = got.layouts[0].floors[0];
    expect(gf.rooms[0].wallColor).toBe('#d6e6f5');
    expect(gf.rooms[0].sideColors).toEqual({ right: '#264653' });
    expect(gf.partitions[0]).toMatchObject({ bottomMm: 2134, color: '#fbe7c6' });
    expect(gf.zones[0].personId).toBe('aman');
    expect(gf.points[0]).toMatchObject({ kind: 'power', heightMm: 2134 });
    expect(gf.covers).toHaveLength(1);
    expect(gf.items.find((i: any) => i.id === 'ac')).toMatchObject({ owner: 'aman', power: 'heavy', elevationMm: 2134 });
    expect(got.people[0].name).toBe('Aman');
    expect(got.meId).toBe('aman');
    expect(got.layouts[0].estimate.paint.coats).toBe(3);
    expect(got.layouts[0].estimate.cement.mortarMix).toBe(5);
    expect(got.layouts[0].estimate.rooms[room.id]).toEqual({ mode: 'none' });
  });

  it('delete account removes everything', async () => {
    expect((await accountPOST(post('/api/account', { password: 'wrong' }, b))).status).toBe(401);
    expect((await accountPOST(post('/api/account', { password: 'secret123' }, b))).status).toBe(200);
    expect((await (await meGET(get('/api/auth/me', b))).json()).user).toBeNull();
    expect(await (await nameGET(get('/api/auth/name?name=Sync B'))).json()).toEqual({ available: true });
  });
});
