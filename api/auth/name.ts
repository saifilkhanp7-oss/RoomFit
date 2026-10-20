// GET /api/auth/name?name=Saif  → is this name free to sign up with?
import { handler } from '../../server/http.js';
import { nameAvailable } from '../../server/auth.js';

export const GET = handler(nameAvailable);
