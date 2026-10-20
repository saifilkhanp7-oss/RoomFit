// POST /api/auth/signup  { name, password }  → { user, recoveryCode } + logs this device in
import { handler } from '../../server/http.js';
import { signup } from '../../server/auth.js';

export const POST = handler(signup);
