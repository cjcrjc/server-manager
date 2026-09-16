import { getDAVClient } from './client.mjs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

try {
  const client = await getDAVClient();
  const cals = await client.fetchCalendars();
  console.log(JSON.stringify({ ok: true, detail: `Connected (${cals.length} calendars)` }));
} catch (e) {
  console.error(JSON.stringify({ ok: false, error: e.message || String(e) }));
  process.exit(1);
}
