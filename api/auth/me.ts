// GET /api/auth/me  → { user } if this device is logged in (and renews the login)
import { handler } from '../../server/http.js';
import { me } from '../../server/auth.js';

export const GET = handler(me);
