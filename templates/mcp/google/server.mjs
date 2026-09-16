import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const root = path.dirname(__filename);
process.chdir(root);

const envPath = path.join(root, ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath, override: true });
}

if (!process.env.GOOGLE_ACCOUNTS) {
  process.env.GOOGLE_ACCOUNTS = "default:me";
}

await import("./node_modules/mcp-google-multi/dist/index.js");
