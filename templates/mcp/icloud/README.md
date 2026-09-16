# iCloud MCP Server

Local MCP server providing CalDAV read & write access to Apple iCloud Calendars and Reminders.

## Credentials Setup

Run the setup helper in your SSH / server terminal:

```bash
/home/cam/icloud-mcp/configure.py
```

- **Apple ID**: Your Apple ID email address (e.g. `user@icloud.com`).
- **App-Specific Password**: Generate one at [appleid.apple.com](https://appleid.apple.com) under **Sign-In and Security** -> **App-Specific Passwords**.

Credentials are stored securely in `~/.icloud_credentials.env` with `0600` permissions.

## Tools Provided

- `icloud_list_calendars`: List all iCloud calendars and reminder lists.
- `icloud_get_events`: Retrieve calendar events.
- `icloud_create_event`: Create new calendar events.
- `icloud_list_reminders`: Retrieve tasks/reminders.
- `icloud_create_reminder`: Create new reminders.
