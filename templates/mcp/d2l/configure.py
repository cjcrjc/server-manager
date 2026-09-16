#!/usr/bin/env python3
"""Configure Waterloo LEARN automated credentials or session cookies."""
import getpass
import json
import os
import subprocess
import sys
from pathlib import Path

path = Path.home() / '.learn_cookies.env'

def read_existing():
    if not path.exists():
        return {}
    values = {}
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            try:
                values[k.strip()] = json.loads(v.strip())
            except Exception:
                values[k.strip()] = v.strip().strip('"\'')
    return values

def save_env(values):
    tmp = path.with_suffix('.env.tmp')
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        for k, v in values.items():
            f.write(f'{k}={json.dumps(v)}\n')
    os.replace(tmp, path)
    print(f'\nSaved credentials privately to {path} (mode 0600).')

def main():
    existing = read_existing()
    print('=== Waterloo LEARN D2L Configuration ===')
    print('Configure your Waterloo credentials for automatic login with Duo Push 2FA.')
    print('Your input is hidden and stored with mode 0600 in ~/.learn_cookies.env.\n')

    existing_user = existing.get('WATERLOO_USERNAME') or existing.get('D2L_USERNAME', '')
    user_prompt = f'Waterloo Username/Email [{existing_user}]: ' if existing_user else 'Waterloo Username/Email (e.g. username@uwaterloo.ca): '
    username = input(user_prompt).strip() or existing_user

    password = getpass.getpass('Waterloo Password (hidden, press Enter to keep existing): ').strip()
    if not password:
        password = existing.get('WATERLOO_PASSWORD') or existing.get('D2L_PASSWORD', '')

    feed = input('Calendar Feed URL (optional, press Enter to skip): ').strip()
    if not feed:
        feed = existing.get('LEARN_ICAL_URL', '')

    ntfy_topic = input(f"ntfy topic for 2FA code push alerts [{existing.get('NTFY_TOPIC', '')}]: ").strip()
    if not ntfy_topic:
        ntfy_topic = existing.get('NTFY_TOPIC', '')

    if not (username and password):
        print('\nNo username/password provided. Would you like to enter manual cookies instead? (y/N): ', end='')
        choice = input().strip().lower()
        if choice == 'y':
            a = getpass.getpass('d2lSessionVal: ').strip()
            b = getpass.getpass('d2lSecureSessionVal: ').strip()
            if a and b:
                existing['d2lSessionVal'] = a
                existing['d2lSecureSessionVal'] = b
            elif not feed:
                raise SystemExit('No valid credentials provided. Configuration unchanged.')
        elif not feed:
            raise SystemExit('Credentials or calendar feed required. Configuration unchanged.')

    if username and password:
        existing['WATERLOO_USERNAME'] = username
        existing['WATERLOO_PASSWORD'] = password
    if feed is not None:
        existing['LEARN_ICAL_URL'] = feed
    if ntfy_topic is not None:
        existing['NTFY_TOPIC'] = ntfy_topic

    save_env(existing)

    if username and password:
        print('\nWould you like to test login now with Duo Push? (Y/n): ', end='')
        run_now = input().strip().lower()
        if run_now != 'n':
            node_bin = Path.home() / '.local/bin/node'
            node_cmd = str(node_bin) if node_bin.exists() else 'node'
            script_path = Path(__file__).resolve().parent / 'login.mjs'
            print('\nRunning login test...')
            subprocess.run([node_cmd, str(script_path)])

if __name__ == '__main__':
    main()
