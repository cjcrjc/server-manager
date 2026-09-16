// ── Tab switching ──
document.querySelectorAll('nav button[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('nav button[data-tab]').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    const tab = document.getElementById('tab-' + btn.dataset.tab);
    tab.classList.add('active');
    // Lazy-load router tab
    if (btn.dataset.tab === 'router' && !routerLoaded) refreshRouter();
  });
});

// ── Utilities ──
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

async function api(path, opts) {
  try {
    const res = await fetch(path, opts);
    return await res.json();
  } catch (e) {
    toast(e.message, 'error');
    return null;
  }
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

const hostname = window.location.hostname;

// ── Dashboard ──
async function refreshDashboard() {
  const data = await api('/api/status');
  if (!data) return;

  document.getElementById('hostname').textContent = data.hostname || hostname;

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

  const depGrid = document.getElementById('dash-deps');
  depGrid.innerHTML = data.deps.map(d => `<div class="svc-card">
    <div class="dot ${d.ok ? 'active' : 'inactive'}"></div>
    <div class="info">
      <div class="name">${esc(d.name)}</div>
      <span class="port">${d.ok ? 'running' : 'down'}</span>
    </div>
  </div>`).join('');

  const pc = document.getElementById('dash-plugins');
  if (data.plugins.length === 0) {
    pc.innerHTML = '<div class="empty">No plugins installed</div>';
  } else {
    pc.innerHTML = data.plugins.map(p =>
      `<div style="font-size:0.85rem;padding:0.3rem 0;color:var(--muted)">• ${esc(p.name || p.id)}${p._dir && p._dir !== p.id ? `<span class="instance-badge">${esc(p._dir)}</span>` : ''}</div>`
    ).join('');
  }
}

// ── Services ──
async function refreshServices() {
  const svcs = await api('/api/services');
  if (!svcs) return;

  document.getElementById('svc-list').innerHTML = svcs.map(s => `<div class="svc-row">
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

window.restartSvc = async function(unit) {
  const res = await api(`/api/services/${encodeURIComponent(unit)}/restart`, { method: 'POST' });
  if (res?.ok) { toast(`Restarted ${unit}`); setTimeout(refreshServices, 1500); setTimeout(refreshDashboard, 1500); }
  else toast(`Failed to restart ${unit}`, 'error');
};

// ── Plugins (with multi-instance support) ──
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
        <span class="plugin-name">${esc(p.name || p.id)}${p._dir && p._dir !== p.id ? `<span class="instance-badge">${esc(p._dir)}</span>` : ''}</span>
        <button class="btn btn-sm btn-danger" onclick="removePlugin('${esc(p._dir || p.id)}')">Remove</button>
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
    const installedDirs = new Set((installed || []).map(p => p._dir));
    rl.innerHTML = registry.plugins.map(p => {
      const instances = (installed || []).filter(i => i.id === p.id);
      const hasBase = installedDirs.has(p.id);
      return `<div class="plugin-card">
        <div class="plugin-header">
          <span class="plugin-name">${esc(p.name)}${p.multiAccount ? '<span class="instance-badge">multi-account</span>' : ''}</span>
          <div style="display:flex;gap:0.3rem;align-items:center">
            ${hasBase && !p.multiAccount
              ? '<span class="tag" style="background:rgba(34,197,94,0.15);color:var(--green)">Installed</span>'
              : `<button class="btn btn-sm" onclick="installRegistryPlugin('${esc(p.source)}','${esc(p.id)}',${!!p.multiAccount})">${hasBase ? '+ Instance' : 'Install'}</button>`}
          </div>
        </div>
        <div class="plugin-desc">${esc(p.description)}</div>
        ${instances.length > 0 ? `<div style="margin-top:0.3rem;font-size:0.75rem;color:var(--green)">Installed: ${instances.map(i => esc(i._dir)).join(', ')}</div>` : ''}
        ${p.tags ? `<div class="tags">${p.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
      </div>`;
    }).join('');
  }
}

window.installRegistryPlugin = async function(source, id, multiAccount) {
  let installId = id;
  if (multiAccount) {
    const label = prompt(`Account label for this ${id} instance (e.g. "personal", "work"):`);
    if (!label) return;
    installId = `${id}-${label.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}`;
  }
  toast('Installing…');
  const res = await api('/api/plugins/install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, id: installId }),
  });
  if (res?.ok) { toast(`Installed ${installId}`); refreshPlugins(); }
  else toast(res?.error || 'Install failed', 'error');
};

window.removePlugin = async function(id) {
  if (!confirm(`Remove plugin "${id}"?`)) return;
  const res = await api(`/api/plugins/${encodeURIComponent(id)}/remove`, { method: 'POST' });
  if (res?.ok) { toast(`Removed ${id}`); refreshPlugins(); }
  else toast(res?.error || 'Remove failed', 'error');
};

document.getElementById('install-form').addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  toast('Installing…');
  const res = await api('/api/plugins/install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: fd.get('source'), id: fd.get('id') }),
  });
  if (res?.ok) { toast(`Installed ${fd.get('id')}`); e.target.reset(); refreshPlugins(); }
  else toast(res?.error || 'Install failed', 'error');
});

// ── 9Router Tier Editor ──
let routerLoaded = false;
let routerData = null; // { combos, models, policyState }

function providerClass(modelId) {
  const p = modelId.split('/')[0];
  return `prov-${p}`;
}

function providerLabel(modelId) {
  const p = modelId.split('/')[0];
  return p.toUpperCase();
}

function modelChipHTML(modelId, draggable = true) {
  const prov = modelId.includes('/') ? modelId.split('/')[0] : 'combo';
  return `<div class="model-chip" draggable="${draggable}" data-model="${esc(modelId)}">
    <span class="grip">⠿</span>
    <span class="provider-badge ${providerClass(modelId)}">${esc(prov)}</span>
    <span>${esc(modelId.includes('/') ? modelId.split('/').slice(1).join('/') : modelId)}</span>
  </div>`;
}

async function refreshRouter() {
  routerLoaded = true;
  const [comboData, connData] = await Promise.all([
    api('/api/9router/combos'),
    api('/api/9router/connections'),
  ]);
  if (!comboData) return;
  routerData = comboData;

  // Policy status
  const ps = comboData.policyState;
  const policyEl = document.getElementById('router-policy');
  if (ps) {
    policyEl.innerHTML = `<div style="font-size:0.8rem;color:var(--muted)">
      <div>Primary: <strong style="color:var(--text)">${esc(ps.primary)}</strong></div>
      <div>Order: ${(ps.order || []).map(m => `<span class="tag" style="margin:1px">${esc(m)}</span>`).join(' → ')}</div>
      <div>Kiro pacing: <strong style="color:${ps.kiroPacingActive ? 'var(--green)' : 'var(--muted)'}">${ps.kiroPacingActive ? 'active' : 'off'}</strong></div>
      <div>Updated: ${new Date(ps.updatedAt).toLocaleString()}</div>
    </div>`;
  } else {
    policyEl.innerHTML = '<div class="empty">No quota policy state</div>';
  }

  // Render tiers
  renderTiers();

  // Available models pool (models not in any tier)
  renderModelPool();

  // Connections
  const connEl = document.getElementById('router-connections');
  if (connData && connData.length) {
    connEl.innerHTML = `<div class="conn-grid">${connData.map(c => `<div class="conn-card">
      <div class="conn-provider">${esc(c.provider)}<span class="instance-badge">P${c.priority}</span></div>
      <div class="conn-name">${esc(c.name || c.email || c.id.slice(0, 8))}</div>
      <div style="margin-top:0.2rem"><div class="dot ${c.active ? 'active' : 'inactive'}" style="display:inline-block;vertical-align:middle"></div>
        <span style="font-size:0.7rem;color:var(--muted)">${c.active ? 'active' : 'inactive'}</span>
      </div>
    </div>`).join('')}</div>`;
  } else {
    connEl.innerHTML = '<div class="empty">Could not load connections</div>';
  }
}

function renderTiers() {
  const tiersEl = document.getElementById('router-tiers');
  tiersEl.innerHTML = routerData.combos.map(combo => `
    <div class="tier-block" data-combo-id="${combo.id}">
      <div class="tier-header">
        <span class="tier-name">${esc(combo.name)}</span>
        <div style="display:flex;gap:0.3rem;align-items:center">
          <span style="font-size:0.7rem;color:var(--muted)">${combo.models.length} models</span>
          ${combo.name.startsWith('quota-') ? '' : `<button class="btn btn-sm btn-danger" onclick="deleteTier('${combo.id}')">Delete</button>`}
        </div>
      </div>
      <div class="tier-models" data-combo-id="${combo.id}">
        ${combo.models.map(m => modelChipHTML(m)).join('')}
      </div>
    </div>
  `).join('');

  // Attach drag/drop to all tier-models containers
  tiersEl.querySelectorAll('.tier-models').forEach(setupDropZone);
  tiersEl.querySelectorAll('.model-chip').forEach(setupDraggable);
}

function renderModelPool() {
  const usedModels = new Set();
  routerData.combos.forEach(c => c.models.forEach(m => usedModels.add(m)));

  const available = routerData.models.filter(m => !usedModels.has(m) && m.includes('/'));
  // Group by provider
  const byProv = {};
  available.forEach(m => {
    const p = m.split('/')[0];
    (byProv[p] = byProv[p] || []).push(m);
  });

  const poolEl = document.getElementById('router-models');
  poolEl.innerHTML = Object.entries(byProv).sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, models]) => models.map(m => modelChipHTML(m)).join('')).join('');

  setupDropZone(poolEl);
  poolEl.querySelectorAll('.model-chip').forEach(setupDraggable);
}

// ── Drag and Drop ──
let draggedModel = null;
let draggedFrom = null;

function setupDraggable(chip) {
  chip.addEventListener('dragstart', e => {
    draggedModel = chip.dataset.model;
    draggedFrom = chip.closest('[data-combo-id]')?.dataset.comboId || 'pool';
    chip.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedModel);
  });
  chip.addEventListener('dragend', () => {
    chip.classList.remove('dragging');
    draggedModel = null;
    draggedFrom = null;
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  });
}

function setupDropZone(zone) {
  zone.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    zone.classList.add('drag-over');

    // Reorder: find insert position
    const chips = [...zone.querySelectorAll('.model-chip:not(.dragging)')];
    const after = chips.find(chip => {
      const rect = chip.getBoundingClientRect();
      return e.clientY < rect.top + rect.height / 2;
    });
    const dragging = zone.querySelector('.model-chip.dragging');
    if (dragging) {
      if (after) zone.insertBefore(dragging, after);
      else zone.appendChild(dragging);
    }
  });

  zone.addEventListener('dragleave', e => {
    if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag-over');
  });

  zone.addEventListener('drop', async e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const model = e.dataTransfer.getData('text/plain');
    if (!model) return;

    const targetComboId = zone.dataset?.comboId;
    const isPool = !targetComboId;

    // Rebuild model order from DOM for target
    if (!isPool) {
      // If chip not already in this zone, add it
      if (!zone.querySelector(`[data-model="${model}"]`)) {
        const chipEl = document.createElement('div');
        chipEl.innerHTML = modelChipHTML(model);
        const chip = chipEl.firstElementChild;

        // Insert at drop position
        const chips = [...zone.querySelectorAll('.model-chip')];
        const after = chips.find(c => {
          const rect = c.getBoundingClientRect();
          return e.clientY < rect.top + rect.height / 2;
        });
        if (after) zone.insertBefore(chip, after);
        else zone.appendChild(chip);
        setupDraggable(chip);
      }

      // Remove from source tier (if different)
      if (draggedFrom && draggedFrom !== 'pool' && draggedFrom !== targetComboId) {
        const sourceZone = document.querySelector(`.tier-models[data-combo-id="${draggedFrom}"]`);
        const sourceChip = sourceZone?.querySelector(`[data-model="${model}"]`);
        sourceChip?.remove();
        // Save source tier
        await saveTier(draggedFrom, sourceZone);
      }

      // Remove from pool if came from there
      if (draggedFrom === 'pool') {
        const poolChip = document.getElementById('router-models').querySelector(`[data-model="${model}"]`);
        poolChip?.remove();
      }

      // Save target tier
      await saveTier(targetComboId, zone);
    } else {
      // Dropped on pool — remove from tier
      if (draggedFrom && draggedFrom !== 'pool') {
        const sourceZone = document.querySelector(`.tier-models[data-combo-id="${draggedFrom}"]`);
        const sourceChip = sourceZone?.querySelector(`[data-model="${model}"]`);
        sourceChip?.remove();
        await saveTier(draggedFrom, sourceZone);

        // Add to pool if not there
        if (!zone.querySelector(`[data-model="${model}"]`)) {
          const chipEl = document.createElement('div');
          chipEl.innerHTML = modelChipHTML(model);
          const chip = chipEl.firstElementChild;
          zone.appendChild(chip);
          setupDraggable(chip);
        }
      }
    }
  });
}

async function saveTier(comboId, zoneEl) {
  const models = [...zoneEl.querySelectorAll('.model-chip')].map(c => c.dataset.model);
  // Update local data
  const combo = routerData.combos.find(c => c.id === comboId);
  if (combo) combo.models = models;

  const res = await api(`/api/9router/combos/${comboId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ models }),
  });
  if (res?.ok) toast(`Saved ${combo?.name || comboId}`);
  else toast(res?.error || 'Save failed', 'error');
}

window.addTier = async function() {
  const name = prompt('Tier name (e.g. "my-custom-tier"):');
  if (!name) return;
  const res = await api('/api/9router/combos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, models: [] }),
  });
  if (res?.ok) { toast(`Created tier "${name}"`); refreshRouter(); }
  else toast(res?.error || 'Create failed', 'error');
};

window.deleteTier = async function(comboId) {
  const combo = routerData.combos.find(c => c.id === comboId);
  if (!confirm(`Delete tier "${combo?.name || comboId}"?`)) return;
  const res = await api(`/api/9router/combos/${comboId}`, { method: 'DELETE' });
  if (res?.ok) { toast(`Deleted tier`); refreshRouter(); }
  else toast(res?.error || 'Delete failed', 'error');
};

// ── Setup/Deps ──
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

window.fixDep = async function(name) {
  const res = await api(`/api/deps/${encodeURIComponent(name)}/fix`, { method: 'POST' });
  if (res?.ok) { toast(`Fixed ${name}`); setTimeout(refreshDeps, 1500); setTimeout(refreshDashboard, 1500); }
  else toast(res?.reason || `Failed to fix ${name}`, 'error');
};

window.jumpToPort = function(e) {
  e.preventDefault();
  const port = document.getElementById('port-input').value.trim();
  if (port) window.location.href = `http://${hostname}:${port}`;
};

// ── Init ──
refreshDashboard();
refreshServices();
refreshPlugins();
refreshDeps();
setInterval(refreshDashboard, 10000);
