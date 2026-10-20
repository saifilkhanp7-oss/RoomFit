// POST /api/auth/logout  → logs this device out
import { handler } from '../../server/http.js';
import { logout } from '../../server/auth.js';

export const POST = handler(logout);
