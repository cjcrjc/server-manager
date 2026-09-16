#!/usr/bin/env python3
import os
import sys
import stat

CONFIG_FILE = os.path.expanduser("~/.icloud_credentials.env")

def main():
    print("=========================================")
    print("   iCloud CalDAV/CardDAV/IMAP Setup")
    print("=========================================")
    print("Your app-specific password will be stored securely with 0600 permissions in:")
    print(f"  {CONFIG_FILE}\n")

    apple_id = input("Enter Apple ID / iCloud Email (e.g. user@icloud.com): ").strip()
    if not apple_id:
        print("Error: Apple ID is required.")
        sys.exit(1)

    import getpass
    password = getpass.getpass("Enter App-Specific Password (xxxx-xxxx-xxxx-xxxx): ").strip()
    if not password:
        print("Error: Password is required.")
        sys.exit(1)

    content = f"ICLOUD_APPLE_ID={apple_id}\nICLOUD_APP_PASSWORD={password}\n"

    with open(CONFIG_FILE, "w") as f:
        f.write(content)

    os.chmod(CONFIG_FILE, stat.S_IRUSR | stat.S_IWUSR)
    print(f"\nSaved credentials successfully to {CONFIG_FILE} (permissions set to 0600).")
    print("You can now test the connection using the iCloud MCP tools.")

if __name__ == "__main__":
    main()
