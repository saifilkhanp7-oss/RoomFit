// POST /api/auth/recover  { name, code, newPassword }  → { user, recoveryCode (new) }
import { handler } from '../../server/http.js';
import { recover } from '../../server/auth.js';

export const POST = handler(recover);
