import { LearnClient, loadConfig } from './learn.mjs';

async function main() {
  console.log('Loading Waterloo LEARN credentials from ~/.learn_cookies.env...');
  const config = await loadConfig();
  if (!config.username || !config.password) {
    console.error('Error: Waterloo username or password not found in ~/.learn_cookies.env.');
    console.error('Run: python3 /home/cam/d2l-mcp/configure.py');
    process.exit(1);
  }

  const passcode = process.argv[2] || null;
  const client = new LearnClient(config);
  console.log(`Starting login for ${config.username}...`);
  try {
    await client.login(status => {
      console.log(`> ${status}`);
    }, passcode);
    console.log('Login successful! Verifying session with whoami...');
    const user = await client.whoami();
    console.log(`Authenticated as: ${user.FirstName} ${user.LastName} (${user.UniqueName})`);
    console.log('Updated session cookies saved to ~/.learn_cookies.env.');
  } catch (err) {
    console.error(`Login failed: ${err.message || err}`);
    process.exit(1);
  }
}

main();
