let currentStep = 1;
let scannedDir = null;
let selectedRepoUrl = null;
let selectedRepoName = null;

// --- View Navigation ---

function showView(view) {
  document.getElementById('view-catalog').classList.add('hidden');
  document.getElementById('view-search').classList.add('hidden');
  document.getElementById('view-wizard').style.display = 'none';

  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');

  if (view === 'wizard') {
    document.getElementById('view-wizard').style.display = '';
  } else if (view === 'catalog') {
    document.getElementById('view-catalog').classList.remove('hidden');
    loadCatalog();
  } else if (view === 'search') {
    document.getElementById('view-search').classList.remove('hidden');
  }
}

// --- Catalog ---

async function loadCatalog() {
  const container = document.getElementById('catalog-list');
  container.innerHTML = '<p class="hint">Loading...</p>';

  try {
    const res = await fetch('/api/catalog');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    if (!data.catalog || data.catalog.length === 0) {
      container.innerHTML = '<p class="hint">No projects in catalog. Upload one from "New project".</p>';
      return;
    }

    container.innerHTML = '';
    for (const entry of data.catalog) {
      const card = document.createElement('div');
      card.className = 'catalog-card';
      const cardId = 'card-' + entry.repoName.replace(/[^a-zA-Z0-9]/g, '-');

      const date = new Date(entry.pushedAt);
      const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      card.innerHTML = `
        <div class="catalog-info">
          <div class="catalog-repo">${entry.repoName}</div>
          <div class="catalog-path">${entry.dirPath}</div>
          <div class="catalog-meta">
            <span>Pushed: ${dateStr}</span>
            ${entry.languages && entry.languages.length ? '<span> · ' + entry.languages.join(', ') + '</span>' : ''}
            <span id="${cardId}-status" class="catalog-status"></span>
          </div>
        </div>
        <div class="catalog-actions">
          <button id="${cardId}-btn" class="btn-update btn-update-checking" disabled onclick="pushUpdate('${escapeAttr(entry.dirPath)}', '${escapeAttr(entry.repoUrl)}', '${escapeAttr(entry.repoName)}', this)">...</button>
          <a href="https://github.com/${entry.repoName}" target="_blank" class="btn-link">GitHub</a>
          <button class="btn-remove" onclick="removeCatalogEntry('${escapeAttr(entry.repoName)}')">Remove</button>
        </div>
      `;
      container.appendChild(card);

      // Check changes asynchronously
      checkChanges(entry.dirPath, cardId);
    }
  } catch (err) {
    container.innerHTML = '<p class="hint">Error: ' + err.message + '</p>';
  }
}

function escapeAttr(str) {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function checkChanges(dirPath, cardId) {
  const btn = document.getElementById(cardId + '-btn');
  const status = document.getElementById(cardId + '-status');
  if (!btn) return;

  try {
    const res = await fetch('/api/changes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dirPath }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    btn.classList.remove('btn-update-checking');
    btn.disabled = false;

    if (!data.isRepo) {
      btn.classList.add('btn-update-no-changes');
      btn.textContent = 'No repo';
      btn.disabled = true;
      status.textContent = ' · Not a git repo';
    } else if (data.hasChanges) {
      btn.classList.add('btn-update-has-changes');
      btn.textContent = 'Push changes';
      const parts = [];
      if (data.modified) parts.push(data.modified + ' mod');
      if (data.created) parts.push(data.created + ' new');
      if (data.deleted) parts.push(data.deleted + ' del');
      status.textContent = ' · ' + parts.join(', ');
      status.classList.add('has-changes');
    } else {
      btn.classList.add('btn-update-no-changes');
      btn.textContent = 'No changes';
      status.textContent = ' · Up to date';
    }
  } catch {
    btn.classList.remove('btn-update-checking');
    btn.classList.add('btn-update-no-changes');
    btn.textContent = 'Error';
    btn.disabled = true;
  }
}

async function pushUpdate(dirPath, repoUrl, repoName, btn) {
  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Pushing...';

  try {
    const res = await fetch('/api/push-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dirPath, repoUrl, repoName }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    toast('Changes pushed: ' + repoName, 'success');
    loadCatalog();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
}

async function removeCatalogEntry(repoName) {
  try {
    const res = await fetch('/api/catalog/' + encodeURIComponent(repoName), { method: 'DELETE' });
    if (!res.ok) throw new Error((await res.json()).error);
    toast('Removed from catalog', 'success');
    loadCatalog();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// --- Search ---

async function searchProjects() {
  const dirPath = document.getElementById('search-dir').value.trim();
  if (!dirPath) return toast('Enter a directory', 'error');

  const depth = parseInt(document.getElementById('search-depth').value);
  const btn = document.getElementById('btn-search');
  const container = document.getElementById('search-results');

  btn.disabled = true;
  btn.textContent = 'Searching...';

  // Load catalog to know which projects are already added
  let catalogNames = new Set();
  try {
    const catRes = await fetch('/api/catalog');
    const catData = await catRes.json();
    if (catData.catalog) {
      for (const e of catData.catalog) catalogNames.add(e.repoName);
    }
  } catch {}

  container.innerHTML = `
    <div id="search-stats" class="search-stats">
      <div class="stat"><span id="stat-folders">0</span> folders scanned</div>
      <div class="stat"><span id="stat-repos">0</span> git repos found</div>
      <div class="stat"><span id="stat-matches">0</span> your projects</div>
      <div id="stat-current" class="stat-current"></div>
    </div>
    <div id="search-cards"></div>
  `;

  const cardsContainer = document.getElementById('search-cards');
  const url = '/api/search?dirPath=' + encodeURIComponent(dirPath) + '&maxDepth=' + depth;
  const source = new EventSource(url);
  let login = '';

  source.addEventListener('start', (e) => {
    login = JSON.parse(e.data).login;
  });

  source.addEventListener('progress', (e) => {
    const s = JSON.parse(e.data);
    document.getElementById('stat-folders').textContent = s.foldersScanned;
    document.getElementById('stat-repos').textContent = s.gitReposFound;
    document.getElementById('stat-matches').textContent = s.matchesFound;
    const shortDir = s.currentDir.length > 60 ? '...' + s.currentDir.slice(-57) : s.currentDir;
    document.getElementById('stat-current').textContent = shortDir;
  });

  source.addEventListener('match', (e) => {
    const r = JSON.parse(e.data);
    const inCatalog = catalogNames.has(r.repoName);
    const card = document.createElement('div');
    card.className = 'catalog-card' + (inCatalog ? ' catalog-card-existing' : '');
    card.innerHTML = `
      <div class="catalog-info">
        <div class="catalog-repo">${r.repoName}</div>
        <div class="catalog-path">${r.dirPath}</div>
        <div class="catalog-meta">Branch: ${r.branch}${inCatalog ? ' · Already in catalog' : ''}</div>
      </div>
      <div class="catalog-actions">
        ${inCatalog
          ? '<button class="btn-update-no-changes" disabled>In catalog</button>'
          : `<button class="btn-save" onclick="importToCatalog('${escapeAttr(r.dirPath)}', '${escapeAttr(r.repoName)}', '${escapeAttr(r.repoUrl)}', this)">Import to catalog</button>`
        }
      </div>
    `;
    cardsContainer.appendChild(card);
  });

  source.addEventListener('done', (e) => {
    source.close();
    const d = JSON.parse(e.data);
    document.getElementById('stat-current').textContent = 'Done';
    if (d.total === 0) {
      cardsContainer.innerHTML = '<p class="hint">No repos found for ' + d.login + '.</p>';
    }
    btn.disabled = false;
    btn.textContent = 'Search';
  });

  source.addEventListener('error', (e) => {
    // SSE 'error' can be EventSource reconnect or server error
    if (e.data) {
      const d = JSON.parse(e.data);
      toast(d.error, 'error');
    }
    source.close();
    btn.disabled = false;
    btn.textContent = 'Search';
  });

  source.onerror = () => {
    source.close();
    btn.disabled = false;
    btn.textContent = 'Search';
  };
}

async function importToCatalog(dirPath, repoName, repoUrl, btn) {
  btn.disabled = true;
  btn.textContent = 'Importing...';

  try {
    const res = await fetch('/api/catalog/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dirPath, repoName, repoUrl }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    btn.textContent = 'Imported';
    toast('Imported: ' + repoName, 'success');
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Import to catalog';
  }
}

// --- Step Navigation ---

function goStep(n) {
  document.querySelector(`.step-panel.active`).classList.add('hidden');
  document.querySelector(`.step-panel.active`).classList.remove('active');
  document.getElementById(`step-${n}`).classList.remove('hidden');
  document.getElementById(`step-${n}`).classList.add('active');

  document.querySelectorAll('.step-dot').forEach(dot => {
    const s = parseInt(dot.dataset.step);
    dot.classList.remove('active', 'done');
    if (s === n) dot.classList.add('active');
    else if (s < n) dot.classList.add('done');
  });

  currentStep = n;

  // Auto-actions on step enter
  if (n === 2) loadGitignore();
  if (n === 3) loadSavedToken();
  if (n === 5) showSummary();
}

// --- Step 1: Scan ---

async function scanDir() {
  const dirPath = document.getElementById('dir-path').value.trim();
  if (!dirPath) return toast('Enter a path', 'error');

  const btn = document.getElementById('btn-scan');
  btn.disabled = true;
  btn.textContent = 'Scanning...';

  try {
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dirPath }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    scannedDir = data;
    document.getElementById('file-tree').textContent = renderTree(data, '');
    document.getElementById('detected-langs').textContent =
      'Detected languages: ' + (data.detectedLanguages.length ? data.detectedLanguages.join(', ') : 'none');
    document.getElementById('scan-result').classList.remove('hidden');
    document.getElementById('btn-to-2').disabled = false;
    // Auto-fill repo name
    document.getElementById('repo-name').value = data.name;
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Scan';
  }
}

function renderTree(node, indent) {
  let out = indent + (node.type === 'directory' ? '📁 ' : '📄 ') + node.name;
  if (node.skipped) out += ' (skipped)';
  if (node.truncated) out += ' (...)';
  out += '\n';
  if (node.children) {
    for (const child of node.children) {
      out += renderTree(child, indent + '  ');
    }
  }
  return out;
}

// --- Step 2: .gitignore ---

async function loadGitignore() {
  const dirPath = document.getElementById('dir-path').value.trim();
  const textarea = document.getElementById('gitignore-content');
  let hasExisting = false;

  // Try reading existing first
  try {
    const res = await fetch('/api/gitignore/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dirPath }),
    });
    const data = await res.json();
    if (data.content) {
      textarea.value = data.content;
      hasExisting = true;
    }
  } catch {}

  // Generate if none exists
  if (!hasExisting) {
    try {
      const res = await fetch('/api/gitignore/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dirPath }),
      });
      const data = await res.json();
      textarea.value = data.content || '';
    } catch (err) {
      toast('Error generating .gitignore: ' + err.message, 'error');
    }
  }

  // Load suggestions for missing rules
  loadSuggestions(dirPath);
}

async function loadSuggestions(dirPath) {
  const container = document.getElementById('gitignore-suggestions');
  const list = document.getElementById('suggestions-list');

  try {
    const res = await fetch('/api/gitignore/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dirPath }),
    });
    const data = await res.json();

    if (!data.missing || data.missing.length === 0) {
      container.classList.add('hidden');
      return;
    }

    list.innerHTML = '';
    for (const rule of data.missing) {
      const label = document.createElement('label');
      label.className = 'suggestion-item';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.value = rule;
      label.appendChild(cb);
      label.appendChild(document.createTextNode(' ' + rule));
      list.appendChild(label);
    }
    container.classList.remove('hidden');
  } catch {}
}

function applySuggestions() {
  const checkboxes = document.querySelectorAll('#suggestions-list input[type="checkbox"]:checked');
  if (checkboxes.length === 0) return toast('No rules selected', 'error');

  const textarea = document.getElementById('gitignore-content');
  let content = textarea.value.trimEnd();

  const newRules = [];
  for (const cb of checkboxes) {
    newRules.push(cb.value);
  }

  content += '\n\n# Fluxite suggestions\n' + newRules.join('\n') + '\n';
  textarea.value = content;

  // Hide applied suggestions
  document.getElementById('gitignore-suggestions').classList.add('hidden');
  toast(newRules.length + ' rule(s) applied', 'success');
}

async function saveGitignore() {
  const dirPath = document.getElementById('dir-path').value.trim();
  const content = document.getElementById('gitignore-content').value;

  try {
    const res = await fetch('/api/gitignore/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dirPath, content }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    toast('.gitignore saved', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

// --- Step 3: Auth ---

async function loadSavedToken() {
  try {
    const res = await fetch('/api/token');
    const data = await res.json();
    if (data.token) {
      document.getElementById('gh-token').value = data.token;
      await validateGHToken();
    }
  } catch {}
}

async function validateGHToken() {
  const token = document.getElementById('gh-token').value.trim();
  if (!token) return toast('Enter a token', 'error');

  try {
    const res = await fetch('/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    document.getElementById('gh-avatar').src = data.user.avatar;
    document.getElementById('gh-login').textContent = data.user.login + (data.user.name ? ` (${data.user.name})` : '');
    document.getElementById('gh-user').classList.remove('hidden');
    document.getElementById('btn-to-4').disabled = false;
    toast('Token valid', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

// --- Step 4: Repo ---

function showTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + tabId).classList.remove('hidden');
  event.target.classList.add('active');
}

async function createNewRepo() {
  const name = document.getElementById('repo-name').value.trim();
  if (!name) return toast('Enter a name', 'error');

  try {
    const res = await fetch('/api/repos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        description: document.getElementById('repo-desc').value.trim(),
        isPrivate: document.getElementById('repo-private').checked,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    selectRepo(data.repo.name, data.repo.url);
    if (data.repo.recovered) {
      toast('Repo already existed (empty) — reusing it', 'success');
    } else {
      toast('Repository created', 'success');
    }
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function loadRepos() {
  try {
    const res = await fetch('/api/repos');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const select = document.getElementById('repo-list');
    select.innerHTML = '';
    for (const repo of data.repos) {
      const opt = document.createElement('option');
      opt.value = repo.url;
      opt.textContent = repo.name + (repo.private ? ' 🔒' : '');
      select.appendChild(opt);
    }
    select.classList.remove('hidden');
    select.onchange = () => {
      const opt = select.options[select.selectedIndex];
      selectRepo(opt.textContent.replace(' 🔒', ''), opt.value);
    };
  } catch (err) {
    toast(err.message, 'error');
  }
}

function selectRepo(name, url) {
  selectedRepoName = name;
  selectedRepoUrl = url;
  document.getElementById('selected-repo-name').textContent = name;
  document.getElementById('selected-repo').classList.remove('hidden');
  document.getElementById('btn-to-5').disabled = false;
}

// --- Step 5: Push ---

function showSummary() {
  document.getElementById('summary-dir').textContent = document.getElementById('dir-path').value.trim();
  document.getElementById('summary-repo').textContent = selectedRepoName;
}

async function pushProject() {
  const dirPath = document.getElementById('dir-path').value.trim();
  const btn = document.querySelector('.btn-push');
  const resultDiv = document.getElementById('push-result');

  btn.disabled = true;
  btn.textContent = 'Pushing...';
  resultDiv.classList.add('hidden');

  try {
    const res = await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dirPath,
        repoUrl: selectedRepoUrl,
        repoName: selectedRepoName,
        languages: scannedDir ? scannedDir.detectedLanguages : [],
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    resultDiv.textContent = 'Project pushed successfully to ' + selectedRepoName;
    resultDiv.classList.remove('hidden');
    document.getElementById('push-done').classList.remove('hidden');
    toast('Pushed successfully', 'success');
  } catch (err) {
    resultDiv.textContent = 'Error: ' + err.message;
    resultDiv.classList.remove('hidden');
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Push to GitHub';
  }
}

// --- Toast ---

function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast ' + type;
  setTimeout(() => el.classList.add('hidden'), 3000);
}

// --- Reset ---

function resetWizard() {
  scannedDir = null;
  selectedRepoUrl = null;
  selectedRepoName = null;

  document.getElementById('dir-path').value = '';
  document.getElementById('scan-result').classList.add('hidden');
  document.getElementById('btn-to-2').disabled = true;
  document.getElementById('gitignore-content').value = '';
  document.getElementById('gitignore-suggestions').classList.add('hidden');
  document.getElementById('gh-user').classList.add('hidden');
  document.getElementById('btn-to-4').disabled = true;
  document.getElementById('repo-name').value = '';
  document.getElementById('repo-desc').value = '';
  document.getElementById('repo-private').checked = false;
  document.getElementById('repo-list').classList.add('hidden');
  document.getElementById('selected-repo').classList.add('hidden');
  document.getElementById('btn-to-5').disabled = true;
  document.getElementById('push-result').classList.add('hidden');
  document.getElementById('push-done').classList.add('hidden');

  goStep(1);
}
