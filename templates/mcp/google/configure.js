import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { execSync } from "node:child_process";

const ENV_FILE = path.join(process.cwd(), ".env");

console.log("=== Quick Google Account Setup ===");
console.log("No Client ID or Client Secret needed! Just enter your Google email address.\n");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
  let userEmail = await ask("Enter your Google Account email (e.g. user@gmail.com): ");
  userEmail = userEmail.trim();

  if (!userEmail) {
    console.error("Email is required.");
    rl.close();
    process.exit(1);
  }

  const envContent = `GOOGLE_ACCOUNTS=personal:${userEmail}\n`;
  fs.writeFileSync(ENV_FILE, envContent, "utf-8");
  console.log(`\nSaved config for ${userEmail}.`);
  console.log("Opening browser window for Google authorization...\n");
  rl.close();

  try {
    execSync("npx mcp-google-multi auth", { stdio: "inherit", cwd: process.cwd() });
  } catch (e) {
    console.log("\nIf browser did not open automatically, run:");
    console.log("  npx mcp-google-multi auth");
  }
}

main().catch(console.error);
