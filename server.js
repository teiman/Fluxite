const express = require('express');
const path = require('path');
const { scanDirectory } = require('./lib/scanner');
const { readToken, writeToken } = require('./lib/token-store');
const { generateGitignore, readGitignore, writeGitignore, suggestMissing } = require('./lib/gitignore');
const { validateToken, createRepo, listRepos, pushProject, checkLocalChanges } = require('./lib/github');
const { readCatalog, addEntry, removeEntry, updatePushDate } = require('./lib/catalog');
const { searchProjects } = require('./lib/search');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Scan a directory
app.post('/api/scan', async (req, res) => {
  try {
    const { dirPath } = req.body;
    if (!dirPath) return res.status(400).json({ error: 'dirPath is required' });
    const tree = await scanDirectory(dirPath);
    res.json(tree);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get saved token
app.get('/api/token', async (req, res) => {
  try {
    const token = await readToken();
    res.json({ token: token || '' });
  } catch {
    res.json({ token: '' });
  }
});

// Save and validate token
app.post('/api/token', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'token is required' });
    const user = await validateToken(token);
    await writeToken(token);
    res.json({ user });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token: ' + err.message });
  }
});

// Generate .gitignore suggestion
app.post('/api/gitignore/generate', async (req, res) => {
  try {
    const { dirPath } = req.body;
    const content = await generateGitignore(dirPath);
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Read existing .gitignore
app.post('/api/gitignore/read', async (req, res) => {
  try {
    const { dirPath } = req.body;
    const content = await readGitignore(dirPath);
    res.json({ content });
  } catch {
    res.json({ content: null });
  }
});

// Write .gitignore
app.post('/api/gitignore/write', async (req, res) => {
  try {
    const { dirPath, content } = req.body;
    await writeGitignore(dirPath, content);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Suggest missing .gitignore rules
app.post('/api/gitignore/suggest', async (req, res) => {
  try {
    const { dirPath } = req.body;
    const missing = await suggestMissing(dirPath);
    res.json({ missing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List user repos
app.get('/api/repos', async (req, res) => {
  try {
    const token = await readToken();
    if (!token) return res.status(401).json({ error: 'No token saved' });
    const repos = await listRepos(token);
    res.json({ repos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create repo on GitHub
app.post('/api/repos', async (req, res) => {
  try {
    const token = await readToken();
    if (!token) return res.status(401).json({ error: 'No token saved' });
    const { name, description, isPrivate } = req.body;
    const repo = await createRepo(token, { name, description, isPrivate });
    res.json({ repo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Push project to GitHub
app.post('/api/push', async (req, res) => {
  try {
    const token = await readToken();
    if (!token) return res.status(401).json({ error: 'No token saved' });
    const { dirPath, repoUrl, repoName, languages } = req.body;
    const result = await pushProject(dirPath, repoUrl, token);
    // Save to catalog
    if (repoName) {
      await addEntry({ dirPath, repoName, repoUrl, languages });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Push update for existing catalog project
app.post('/api/push-update', async (req, res) => {
  try {
    const token = await readToken();
    if (!token) return res.status(401).json({ error: 'No token saved' });
    const { dirPath, repoUrl, repoName } = req.body;
    const result = await pushProject(dirPath, repoUrl, token);
    await updatePushDate(repoName);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Catalog endpoints
app.get('/api/catalog', async (req, res) => {
  try {
    const catalog = await readCatalog();
    res.json({ catalog });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/catalog/add', async (req, res) => {
  try {
    const { dirPath, repoName, repoUrl, languages } = req.body;
    const entry = await addEntry({ dirPath, repoName, repoUrl, languages });
    res.json({ entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/catalog/:repoName', async (req, res) => {
  try {
    const repoName = decodeURIComponent(req.params.repoName);
    await removeEntry(repoName);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check local changes for a project
app.post('/api/changes', async (req, res) => {
  try {
    const { dirPath } = req.body;
    if (!dirPath) return res.status(400).json({ error: 'dirPath is required' });
    const result = await checkLocalChanges(dirPath);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search for git projects in a directory (SSE stream)
app.get('/api/search', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const token = await readToken();
    if (!token) { send('error', { error: 'No token saved' }); res.end(); return; }
    const user = await validateToken(token);
    const dirPath = req.query.dirPath;
    const maxDepth = parseInt(req.query.maxDepth) || 3;
    if (!dirPath) { send('error', { error: 'dirPath is required' }); res.end(); return; }

    send('start', { login: user.login });

    const results = await searchProjects(dirPath, user.login, maxDepth, {
      onProgress(stats) {
        send('progress', stats);
      },
      onMatch(match) {
        send('match', match);
      },
    });

    send('done', { total: results.length, login: user.login });
  } catch (err) {
    send('error', { error: err.message });
  }
  res.end();
});

const PORT = process.env.PORT || 3847;
app.listen(PORT, async () => {
  console.log(`Fluxite running at http://localhost:${PORT}`);
  try {
    const open = (await import('open')).default;
    open(`http://localhost:${PORT}`);
  } catch {
    console.log('Could not open browser automatically.');
  }
});
