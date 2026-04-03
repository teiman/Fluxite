const fs = require('fs/promises');
const path = require('path');
const os = require('os');

const CATALOG_FILE = path.join(os.homedir(), '.fluxite', 'catalog.json');

async function readCatalog() {
  try {
    const data = await fs.readFile(CATALOG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeCatalog(catalog) {
  await fs.mkdir(path.dirname(CATALOG_FILE), { recursive: true });
  await fs.writeFile(CATALOG_FILE, JSON.stringify(catalog, null, 2), 'utf-8');
}

async function addEntry(entry) {
  const catalog = await readCatalog();
  // Replace if same repo or same dirPath
  const idx = catalog.findIndex(
    e => e.repoName === entry.repoName || e.dirPath === entry.dirPath
  );
  const record = {
    dirPath: entry.dirPath,
    repoName: entry.repoName,
    repoUrl: entry.repoUrl,
    pushedAt: new Date().toISOString(),
    languages: entry.languages || [],
  };
  if (idx >= 0) {
    catalog[idx] = record;
  } else {
    catalog.push(record);
  }
  await writeCatalog(catalog);
  return record;
}

async function removeEntry(repoName) {
  const catalog = await readCatalog();
  const filtered = catalog.filter(e => e.repoName !== repoName);
  await writeCatalog(filtered);
}

async function updatePushDate(repoName) {
  const catalog = await readCatalog();
  const entry = catalog.find(e => e.repoName === repoName);
  if (entry) {
    entry.pushedAt = new Date().toISOString();
    await writeCatalog(catalog);
  }
  return entry;
}

module.exports = { readCatalog, addEntry, removeEntry, updatePushDate };
