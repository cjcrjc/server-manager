import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

// Map of active sessions: sessionId -> { proc, history, listeners, lastActive }
const sessions = new Map();

const PY_PTY = `
import pty, os, sys, select

master, slave = pty.openpty()
pid = os.fork()

if pid == 0:
    os.close(master)
    os.setsid()
    os.dup2(slave, 0)
    os.dup2(slave, 1)
    os.dup2(slave, 2)
    os.close(slave)
    os.execvp(sys.argv[1], sys.argv[1:])
else:
    os.close(slave)
    try:
        while True:
            r, _, _ = select.select([sys.stdin.fileno(), master], [], [])
            if sys.stdin.fileno() in r:
                data = os.read(sys.stdin.fileno(), 1024)
                if not data:
                    break
                os.write(master, data)
            if master in r:
                try:
                    data = os.read(master, 1024)
                    if not data:
                        break
                    sys.stdout.buffer.write(data)
                    sys.stdout.buffer.flush()
                except OSError:
                    break
    except Exception:
        pass
    os.waitpid(pid, 0)
`;

export function startSession(cmd, args = [], opts = {}) {
  const sessionId = randomUUID();
  const proc = spawn('python3', ['-u', '-c', PY_PTY, cmd, ...args], {
    cwd: opts.cwd || process.cwd(),
    env: { ...process.env, TERM: 'xterm-256color', ...(opts.env || {}) },
    stdio: ['pipe', 'pipe', 'inherit']
  });

  const session = {
    id: sessionId,
    proc,
    history: '',
    listeners: new Set(),
    alive: true,
    exitCode: null
  };

  proc.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    session.history = (session.history + text).slice(-30000); // keep last 30KB
    for (const listener of session.listeners) {
      listener(text);
    }
  });

  proc.on('close', (code) => {
    session.alive = false;
    session.exitCode = code;
    for (const listener of session.listeners) {
      listener(`\r\n[Process exited with code ${code}]\r\n`, true);
    }
  });

  sessions.set(sessionId, session);

  // Auto clean up after 10 mins
  setTimeout(() => {
    if (sessions.has(sessionId)) {
      try { session.proc.kill(); } catch {}
      sessions.delete(sessionId);
    }
  }, 600000);

  return sessionId;
}

export function writeSession(sessionId, input) {
  const session = sessions.get(sessionId);
  if (!session || !session.alive) return false;
  session.proc.stdin.write(input);
  return true;
}

export function attachSession(sessionId, onData) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  // Send current backlog first
  if (session.history) onData(session.history, !session.alive);
  session.listeners.add(onData);
  return () => {
    session.listeners.delete(onData);
  };
}

export function killSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return false;
  try {
    session.proc.kill('SIGTERM');
  } catch {}
  sessions.delete(sessionId);
  return true;
}
