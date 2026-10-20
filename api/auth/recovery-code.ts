// POST /api/auth/recovery-code  { password }  → { recoveryCode } (new one; the old one stops working)
import { handler } from '../../server/http.js';
import { newCode } from '../../server/auth.js';

export const POST = handler(newCode);
