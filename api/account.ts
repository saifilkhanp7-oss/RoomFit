// POST /api/account  { password }  → deletes the account and all its plans
import { handler } from '../server/http.js';
import { deleteAccount } from '../server/auth.js';

export const POST = handler(deleteAccount);
