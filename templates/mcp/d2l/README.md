# Waterloo LEARN MCP

Local MCP server for https://learn.uwaterloo.ca, installed outside Snap and registered as `d2l` in native agy. Uses the official MCP SDK over stdio and GET requests to LEARN. The MCP host launches it on demand; it does not need a listening port or a daemon restart.

## Authentication & Duo Push Auto-Login

The MCP server automatically detects expired sessions (`ACCESS_DENIED`, `AUTH_REQUIRED`, or login page redirects) and can automatically authenticate with Waterloo ADFS, send a **Duo Push 2FA notification to your phone**, and capture the new `d2lSessionVal` and `d2lSecureSessionVal` cookies.

### 1. Configure Credentials

Run the helper script once in your terminal:

```bash
python3 /home/cam/d2l-mcp/configure.py
```

- Enter your Waterloo username / email (e.g. `cchin@uwaterloo.ca`).
- Enter your password (input is hidden via `getpass`).
- (Optional) Enter your LEARN Calendar feed URL.

Credentials are saved with mode `0600` in `~/.learn_cookies.env`.

### 2. How Automated Login Works

1. Whenever any tool encounters `ACCESS_DENIED` or `AUTH_REQUIRED`, the client automatically triggers the SAML/ADFS authentication flow.
2. A **Duo Push notification** is sent directly to your mobile device.
3. Once you tap **Approve** on your phone:
   - Duo confirms authentication.
   - The MCP client automatically receives the SAML assertion, completes sign-in with `learn.uwaterloo.ca`, and extracts `d2lSessionVal` and `d2lSecureSessionVal`.
   - The new cookies are saved to `~/.learn_cookies.env`.
   - The failed MCP tool request is retried seamlessly with the new session!

### 3. Manual / Standalone Testing

To test or trigger authentication directly from the CLI:

```bash
node /home/cam/d2l-mcp/login.mjs
```

Or call the `learn_login` MCP tool.

## Tools

- `learn_status`: Check connection, API versions, credential setup, and auth status.
- `learn_login`: Explicitly trigger automated Waterloo login and Duo Push.
- `learn_whoami`, `learn_courses`: User profile and enrolled courses.
- `learn_assignments`, `learn_submissions`: Assignment dropboxes and submission status.
- `learn_announcements`, `learn_grades`, `learn_quizzes`: Announcements, grades, and quizzes.
- `learn_calendar`, `learn_upcoming`: Published events, due dates, and schedule.
- `learn_export_calendar`: Export `.ics` and JSON snapshots under `~/.local/share/d2l-mcp`.

## Maintenance & Validation

```bash
cd /home/cam/d2l-mcp
PATH=/home/cam/.local/bin:$PATH npm test
PATH=/home/cam/.local/bin:$PATH npm run check
PATH=/home/cam/.local/bin:$PATH node smoke.mjs
```
