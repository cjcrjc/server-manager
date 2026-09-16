import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { getDAVClient } from './client.mjs';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(res => rl.question(q, res));

console.log("=== iCloud CalDAV Setup ===");
const appleId = (await ask("Apple ID (email): ")).trim();
const appPass = (await ask("App-Specific Password (xxxx-xxxx-xxxx-xxxx): ")).trim();
rl.close();

if (!appleId || !appPass) {
  console.error("Both Apple ID and App-Specific Password are required.");
  process.exit(1);
}

const envPath = path.join(process.cwd(), '.env');
fs.writeFileSync(envPath, `ICLOUD_APPLE_ID=${appleId}\nICLOUD_APP_PASSWORD=${appPass}\n`, { mode: 0o600 });
console.log("Saved credentials to .env. Verifying connection...");

try {
  process.env.ICLOUD_APPLE_ID = appleId;
  process.env.ICLOUD_APP_PASSWORD = appPass;
  const client = await getDAVClient();
  const cals = await client.fetchCalendars();
  console.log(`Verification SUCCESS! Found ${cals.length} calendars.`);
} catch (e) {
  console.error(`Verification error: ${e.message}`);
}
