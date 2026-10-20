// POST /api/auth/login  { name, password }  → { user } + logs this device in
import { handler } from '../../server/http.js';
import { login } from '../../server/auth.js';

export const POST = handler(login);
