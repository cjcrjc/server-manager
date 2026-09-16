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
  const [installed, registry, statuses] = await Promise.all([
    api('/api/plugins'),
    api('/api/plugins/registry'),
    api('/api/plugins/status'),
  ]);
  const statusOf = new Map((statuses || []).map(s => [s.id, s]));

  const il = document.getElementById('installed-plugins');
  if (!installed || installed.length === 0) {
    il.innerHTML = '<div class="empty">No plugins installed</div>';
  } else {
    il.innerHTML = installed.map(p => {
      const dir = p._dir || p.id;
      const st = statusOf.get(dir) || { state: 'error', detail: 'Unknown' };
      return `<div class="plugin-card">
      <div class="plugin-header">
        <span class="plugin-name"><span class="dot dot-${esc(st.state)}" title="${esc(st.detail)}"></span>${esc(p.name || p.id)}${p._dir && p._dir !== p.id ? `<span class="instance-badge">${esc(p._dir)}</span>` : ''}</span>
        <div style="display:flex;gap:0.3rem">
          <button class="btn btn-sm" onclick="configurePlugin('${esc(dir)}')">Configure</button>
          <button class="btn btn-sm btn-danger" onclick="removePlugin('${esc(dir)}')">Remove</button>
        </div>
      </div>
      <div class="plugin-desc status-${esc(st.state)}">${esc(st.detail)}</div>
      ${p.description ? `<div class="plugin-desc">${esc(p.description)}</div>` : ''}
      ${p.error ? `<div class="plugin-desc" style="color:var(--red)">${esc(p.error)}</div>` : ''}
      ${p.tags ? `<div class="tags">${p.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
    </div>`;
    }).join('');
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

function modelChipHTML(modelId, draggable = true, showRemove = true) {
  const prov = modelId.includes('/') ? modelId.split('/')[0] : 'combo';
  return `<div class="model-chip" draggable="${draggable}" data-model="${esc(modelId)}">
    <span class="grip">⠿</span>
    <span class="provider-badge ${providerClass(modelId)}">${esc(prov)}</span>
    <span>${esc(modelId.includes('/') ? modelId.split('/').slice(1).join('/') : modelId)}</span>
    ${showRemove ? `<span class="chip-remove" title="Remove model" onclick="removeModelFromTier(event, '${esc(modelId)}')">&times;</span>` : ''}
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

  const tiersEl = document.getElementById('router-tiers');
  const policyEl = document.getElementById('router-policy');
  const connEl = document.getElementById('router-connections');

  if (comboData.installed === false) {
    policyEl.innerHTML = `
      <div style="padding:1rem;background:#1a1515;border:1px solid #7f1d1d;border-radius:6px;color:#fca5a5">
        <strong>9Router is not installed or initialized.</strong>
        <p style="font-size:0.8rem;margin-top:0.4rem;color:var(--muted)">
          Go to the <strong>Setup</strong> tab to install 9Router, or run: <code>npm install -g 9router</code>
        </p>
      </div>`;
    tiersEl.innerHTML = '<div class="empty">9Router not running</div>';
    connEl.innerHTML = '<div class="empty">No connections found</div>';
    return;
  }

  // Policy status
  const ps = comboData.policyState;
  if (ps) {
    const isAvgEnabled = ps.settings?.averagedUsage !== false && ps.averagedUsageEnabled !== false;
    const monthlyInfo = ps.monthlyQuotaInfo || {};
    const monthlyDetails = Object.entries(monthlyInfo).map(([prov, info]) => {
      const statusColor = info.behind ? 'var(--red)' : 'var(--green)';
      const statusText = info.behind ? 'behind expected' : 'on track';
      return `<div style="margin-left:0.5rem">
        &bull; <strong>${esc(prov.toUpperCase())}</strong>: ${info.actualPct}% remaining (target &ge; ${info.expectedPct}%) &mdash; <span style="color:${statusColor}">${statusText}</span>
      </div>`;
    }).join('');

    policyEl.innerHTML = `<div style="font-size:0.8rem;color:var(--muted)">
      <div>Primary: <strong style="color:var(--text)">${esc(ps.primary)}</strong></div>
      <div>Order: ${(ps.order || []).map(m => `<span class="tag" style="margin:1px">${esc(m)}</span>`).join(' → ')}</div>
      <div>Kiro pacing: <strong style="color:${ps.kiroPacingActive ? 'var(--green)' : 'var(--muted)'}">${ps.kiroPacingActive ? 'active' : 'off'}</strong></div>
      ${monthlyDetails ? `<div style="margin-top:0.3rem">Monthly quota pace:</div>${monthlyDetails}` : ''}
      <div>Updated: ${new Date(ps.updatedAt).toLocaleString()}</div>
      <div class="quota-pacing-control">
        <label class="checkbox-label">
          <input type="checkbox" id="chk-averaged-usage" ${isAvgEnabled ? 'checked' : ''} onchange="toggleAveragedUsage(this.checked)">
          Enable averaged monthly usage pacing
        </label>
        <div class="info-note">
          <strong>Averaged Usage Pacing:</strong> For models with a monthly quota (e.g. Kiro, Copilot), tracks whether remaining quota keeps pace with the time elapsed in the current billing month. If remaining quota drops below the expected monthly benchmark (e.g. under 50% remaining at mid-month), the model automatically drops to the bottom of its tier priority to preserve quota until reset.
        </div>
      </div>
    </div>`;
  } else {
    policyEl.innerHTML = '<div class="empty">No quota policy state active</div>';
  }

  // Render tiers
  renderTiers();

  // Connections
  if (connData && connData.length) {
    connEl.innerHTML = `<div class="conn-grid">${connData.map(c => `<div class="conn-card">
      <div class="conn-provider">${esc(c.provider)}<span class="instance-badge">P${c.priority}</span></div>
      <div class="conn-name">${esc(c.name || c.email || c.id.slice(0, 8))}</div>
      <div style="margin-top:0.2rem"><div class="dot ${c.active ? 'active' : 'inactive'}" style="display:inline-block;vertical-align:middle"></div>
        <span style="font-size:0.7rem;color:var(--muted)">${c.active ? 'active' : 'inactive'}</span>
      </div>
    </div>`).join('')}</div>`;
  } else {
    connEl.innerHTML = '<div class="empty">No provider connections configured</div>';
  }
}

function renderTiers() {
  const tiersEl = document.getElementById('router-tiers');
  const allModels = (routerData.models || []).filter(m => m.includes('/')).sort();

  tiersEl.innerHTML = routerData.combos.map(combo => {
    const currentSet = new Set(combo.models);
    const unselected = allModels.filter(m => !currentSet.has(m));
    const selectOptions = unselected.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('');

    return `
    <div class="tier-block" data-combo-id="${combo.id}">
      <div class="tier-header">
        <span class="tier-name">${esc(combo.name)}</span>
        <div style="display:flex;gap:0.3rem;align-items:center">
          <span style="font-size:0.7rem;color:var(--muted)">${combo.models.length} models</span>
          ${combo.name.startsWith('quota-') ? '' : `<button class="btn btn-sm btn-danger" onclick="deleteTier('${combo.id}')">Delete</button>`}
        </div>
      </div>
      <div class="tier-models" data-combo-id="${combo.id}">
        ${combo.models.length ? combo.models.map(m => modelChipHTML(m)).join('') : '<div class="tier-empty-msg">No models configured in this tier</div>'}
      </div>
      <div class="tier-add-row" data-combo-id="${combo.id}">
        <select class="tier-model-select">
          <option value="">Select model to add...</option>
          ${selectOptions}
        </select>
        <button class="btn btn-sm btn-outline" onclick="addModelToTier('${combo.id}', this)">+ Add Model</button>
      </div>
    </div>
  `;
  }).join('');

  // Attach drag/drop to all tier-models containers
  tiersEl.querySelectorAll('.tier-models').forEach(setupDropZone);
  tiersEl.querySelectorAll('.model-chip').forEach(setupDraggable);
}

window.addModelToTier = async function(comboId, btnEl) {
  const container = btnEl.closest('.tier-add-row');
  const select = container.querySelector('.tier-model-select');
  const model = select.value;
  if (!model) return;

  const zone = document.querySelector(`.tier-models[data-combo-id="${comboId}"]`);
  if (!zone) return;

  // Remove empty message if present
  const emptyMsg = zone.querySelector('.tier-empty-msg');
  if (emptyMsg) emptyMsg.remove();

  const chipEl = document.createElement('div');
  chipEl.innerHTML = modelChipHTML(model);
  const chip = chipEl.firstElementChild;
  zone.appendChild(chip);
  setupDraggable(chip);

  await saveTier(comboId, zone);
  renderTiers();
};

window.removeModelFromTier = async function(event, modelId) {
  event.stopPropagation();
  const chip = event.target.closest('.model-chip');
  const zone = chip?.closest('.tier-models');
  if (!zone) return;
  const comboId = zone.dataset.comboId;
  chip.remove();
  await saveTier(comboId, zone);
  renderTiers();
};

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
    if (!targetComboId) return;

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
    if (draggedFrom && draggedFrom !== targetComboId) {
      const sourceZone = document.querySelector(`.tier-models[data-combo-id="${draggedFrom}"]`);
      const sourceChip = sourceZone?.querySelector(`[data-model="${model}"]`);
      sourceChip?.remove();
      // Save source tier
      await saveTier(draggedFrom, sourceZone);
    }

    // Save target tier
    await saveTier(targetComboId, zone);
    renderTiers();
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

window.toggleAveragedUsage = async function(enabled) {
  const res = await api('/api/9router/policy/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ averagedUsage: enabled }),
  });
  if (res?.ok) {
    toast(`Averaged usage pacing ${enabled ? 'enabled' : 'disabled'}`);
    setTimeout(refreshRouter, 1000);
  } else {
    toast(res?.error || 'Failed to update pacing setting', 'error');
  }
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
    <div style="display:flex;gap:0.4rem;align-items:center">
      ${!d.ok
        ? (d.canFix
            ? `<button class="btn btn-sm" onclick="fixDep('${esc(d.name)}')">Fix / Start</button>`
            : (d.install ? `<button class="btn btn-sm" onclick="fixDep('${esc(d.name)}')">Install</button>` : ''))
        : ''}
      <span style="font-size:0.8rem;color:${d.ok ? 'var(--green)' : 'var(--red)'}">${d.ok ? 'OK' : 'Down'}</span>
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

// ── Plugin config modal ──
let cfgId = null;

window.configurePlugin = async function(id) {
  const cfg = await api(`/api/plugins/${encodeURIComponent(id)}/config`);
  if (!cfg || cfg.error) return toast(cfg?.error || 'Failed to load config', 'error');
  cfgId = id;
  document.getElementById('cfg-title').textContent = `Configure ${id}`;
  const fields = cfg.env || [];
  document.getElementById('cfg-fields').innerHTML = fields.length
    ? fields.map(f => `<label class="cfg-field">
        <span>${esc(f.label || f.key)}${f.required ? ' <em>*</em>' : ''}</span>
        <input name="${esc(f.key)}" type="${f.secret ? 'password' : 'text'}"
          placeholder="${esc(f.secret && f.set ? '••••••••' : '')}"
          value="${esc(f.secret ? '' : (f.value || ''))}" autocomplete="off">
        ${f.description ? `<small>${esc(f.description)}</small>` : ''}
      </label>`).join('')
    : '<div class="empty">This plugin declares no configuration.</div>';
  document.getElementById('cfg-modal').hidden = false;
};

window.closeConfig = function() {
  cfgId = null;
  document.getElementById('cfg-modal').hidden = true;
};

window.saveConfig = async function(e) {
  e.preventDefault();
  const body = {};
  for (const el of e.target.querySelectorAll('input[name]')) {
    if (el.value !== '') body[el.name] = el.value;
  }
  const res = await api(`/api/plugins/${encodeURIComponent(cfgId)}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res?.ok) { toast('Saved'); closeConfig(); refreshPlugins(); }
  else toast(res?.error || 'Save failed', 'error');
};

window.showMcpConfig = async function() {
  const el = document.getElementById('mcp-config');
  const cfg = await api('/api/plugins/mcp-config');
  if (!cfg) return;
  el.textContent = JSON.stringify(cfg, null, 2);
  el.hidden = false;
};

// ── Init ──
refreshDashboard();
refreshServices();
refreshPlugins();
refreshDeps();
setInterval(refreshDashboard, 10000);
