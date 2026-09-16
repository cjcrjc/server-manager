import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });
const accounts = process.env.GOOGLE_ACCOUNTS;
if (!accounts) {
  console.error(JSON.stringify({ ok: false, error: 'GOOGLE_ACCOUNTS not set' }));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, detail: `Configured for ${accounts}` }));
