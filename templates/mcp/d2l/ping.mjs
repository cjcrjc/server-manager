import { LearnClient, loadConfig } from './learn.mjs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

try {
  const config = await loadConfig();
  const client = new LearnClient(config);
  const versions = await client.versions();
  console.log(JSON.stringify({ ok: true, detail: `Connected (API versions available)` }));
} catch (e) {
  console.error(JSON.stringify({ ok: false, error: e.message || String(e) }));
  process.exit(1);
}
