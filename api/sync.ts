// POST /api/sync  { since, homes: [...changed], templates? }  → { since, homes: [...changed elsewhere], templates? }
import { handler } from '../server/http.js';
import { sync } from '../server/sync.js';

export const POST = handler(sync);
