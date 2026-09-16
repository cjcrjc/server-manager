// Tab switching
document.querySelectorAll('nav button[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('nav button[data-tab]').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// Toast notification
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// API helpers
async function api(path, opts) {
  try {
    const res = await fetch(path, opts);
    return await res.json();
  } catch (e) {
    toast(e.message, 'error');
    return null;
  }
}

const hostname = window.location.hostname;

// Render dashboard
async function refreshDashboard() {
  const data = await api('/api/status');
  if (!data) return;

  document.getElementById('hostname').textContent = data.hostname || hostname;

  // Service cards
  const grid = document.getElementById('dash-services');
  grid.innerHTML = data.services.map(s => {
    const portEl = s.web && s.port
      ? `<a class="port-link" href="http://${hostname}:${s.port}">:${s.port}</a>`
      : `<span class="port">:${s.port || '—'}</span>`;
    return `<div class="svc-card">
      <div class="dot ${s.active ? 'active' : 'inactive'}"></div>
      <div class="info">
        <div class="name">${esc(s.name)}</div>
        ${portEl}
      </div>
    </div>`;
  }).join('');

  // Dep cards
  const depGrid = document.getElementById('dash-deps');
  depGrid.innerHTML = data.deps.map(d => `<div class="svc-card">
    <div class="dot ${d.ok ? 'active' : 'inactive'}"></div>
    <div class="info">
      <div class="name">${esc(d.name)}</div>
      <span class="port">${d.ok ? 'running' : 'down'}</span>
    </div>
  </div>`).join('');

  // Plugin count
  const pc = document.getElementById('dash-plugins');
  if (data.plugins.length === 0) {
    pc.innerHTML = '<div class="empty">No plugins installed</div>';
  } else {
    pc.innerHTML = data.plugins.map(p => `<div style="font-size:0.85rem;padding:0.3rem 0;color:var(--muted)">• ${esc(p.name || p.id)}</div>`).join('');
  }
}

// Render services tab
async function refreshServices() {
  const svcs = await api('/api/services');
  if (!svcs) return;

  const list = document.getElementById('svc-list');
  list.innerHTML = svcs.map(s => `<div class="svc-row">
    <div class="left">
      <div class="dot ${s.active ? 'active' : 'inactive'}"></div>
      <div>
        <div class="name">${esc(s.name)}</div>
        <div class="unit">${esc(s.unit)}${s.port ? ` · :${s.port}` : ''}</div>
      </div>
    </div>
    <div class="actions">
      ${s.web && s.port ? `<a class="btn btn-sm btn-outline" href="http://${hostname}:${s.port}" target="_blank">Open</a>` : ''}
      <button class="btn btn-sm" onclick="restartSvc('${esc(s.unit)}')">Restart</button>
    </div>
  </div>`).join('');
}

async function restartSvc(unit) {
  const res = await api(`/api/services/${encodeURIComponent(unit)}/restart`, { method: 'POST' });
  if (res?.ok) {
    toast(`Restarted ${unit}`);
    setTimeout(refreshServices, 1500);
    setTimeout(refreshDashboard, 1500);
  } else {
    toast(`Failed to restart ${unit}`, 'error');
  }
}

// Render plugins tab
async function refreshPlugins() {
  const [installed, registry] = await Promise.all([
    api('/api/plugins'),
    api('/api/plugins/registry'),
  ]);

  const il = document.getElementById('installed-plugins');
  if (!installed || installed.length === 0) {
    il.innerHTML = '<div class="empty">No plugins installed</div>';
  } else {
    il.innerHTML = installed.map(p => `<div class="plugin-card">
      <div class="plugin-header">
        <span class="plugin-name">${esc(p.name || p.id)}</span>
        <button class="btn btn-sm btn-danger" onclick="removePlugin('${esc(p.id)}')">Remove</button>
      </div>
      ${p.description ? `<div class="plugin-desc">${esc(p.description)}</div>` : ''}
      ${p.error ? `<div class="plugin-desc" style="color:var(--red)">${esc(p.error)}</div>` : ''}
      ${p.tags ? `<div class="tags">${p.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
    </div>`).join('');
  }

  const rl = document.getElementById('registry-plugins');
  if (!registry?.plugins?.length) {
    rl.innerHTML = '<div class="empty">No plugins in registry</div>';
  } else {
    const installedIds = new Set((installed || []).map(p => p.id));
    rl.innerHTML = registry.plugins.map(p => {
      const isInstalled = installedIds.has(p.id);
      return `<div class="plugin-card">
        <div class="plugin-header">
          <span class="plugin-name">${esc(p.name)}</span>
          ${isInstalled
            ? '<span class="tag" style="background:rgba(34,197,94,0.15);color:var(--green)">Installed</span>'
            : `<button class="btn btn-sm" onclick="installPlugin('${esc(p.repo)}','${esc(p.id)}')">Install</button>`}
        </div>
        <div class="plugin-desc">${esc(p.description)}</div>
        ${p.tags ? `<div class="tags">${p.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
      </div>`;
    }).join('');
  }
}

async function installPlugin(repo, id) {
  toast('Installing…');
  const res = await api('/api/plugins/install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo, id }),
  });
  if (res?.ok) {
    toast(`Installed ${id}`);
    refreshPlugins();
  } else {
    toast(res?.error || 'Install failed', 'error');
  }
}

async function removePlugin(id) {
  if (!confirm(`Remove plugin "${id}"?`)) return;
  const res = await api(`/api/plugins/${encodeURIComponent(id)}/remove`, { method: 'POST' });
  if (res?.ok) {
    toast(`Removed ${id}`);
    refreshPlugins();
  } else {
    toast(res?.error || 'Remove failed', 'error');
  }
}

// Custom URL install form
document.getElementById('install-form').addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  await installPlugin(fd.get('repo'), fd.get('id'));
  e.target.reset();
});

// Render setup/deps tab
async function refreshDeps() {
  const depData = await api('/api/deps');
  if (!depData) return;

  document.getElementById('dep-list').innerHTML = depData.map(d => `<div class="dep-row">
    <div class="dep-name">
      <div class="dot ${d.ok ? 'active' : 'inactive'}"></div>
      ${esc(d.name)}
    </div>
    <div>
      ${!d.ok && d.canFix
        ? `<button class="btn btn-sm" onclick="fixDep('${esc(d.name)}')">Fix</button>`
        : `<span style="font-size:0.8rem;color:${d.ok ? 'var(--green)' : 'var(--red)'}">${d.ok ? 'OK' : 'Down'}</span>`}
    </div>
  </div>`).join('');

  const info = await api('/api/config');
  if (info) {
    document.getElementById('server-info').innerHTML = `
      <div>Hostname: <strong>${esc(info.hostname)}</strong></div>
      <div>Port: <strong>${info.port}</strong></div>
      <div>Services configured: <strong>${info.serviceCount}</strong></div>
    `;
  }
}

async function fixDep(name) {
  const res = await api(`/api/deps/${encodeURIComponent(name)}/fix`, { method: 'POST' });
  if (res?.ok) {
    toast(`Fixed ${name}`);
    setTimeout(refreshDeps, 1500);
    setTimeout(refreshDashboard, 1500);
  } else {
    toast(res?.reason || `Failed to fix ${name}`, 'error');
  }
}

// Jump to port
window.jumpToPort = function(e) {
  e.preventDefault();
  const port = document.getElementById('port-input').value.trim();
  if (port) window.location.href = `http://${hostname}:${port}`;
};

// Escape HTML
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

// Initial load + auto-refresh
refreshDashboard();
refreshServices();
refreshPlugins();
refreshDeps();

setInterval(refreshDashboard, 10000);
