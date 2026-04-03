const fs = require('fs/promises');
const path = require('path');

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svn', '__pycache__', '.godot',
  'dist', 'build', '.next', '.nuxt', 'target', 'bin', 'obj',
  '.claude', '.cursor', '.vscode', '.idea',
]);

const MAX_DEPTH = 3;

async function scanDirectory(dirPath, depth = 0) {
  const resolved = path.resolve(dirPath);
  const stat = await fs.stat(resolved);
  if (!stat.isDirectory()) {
    throw new Error(`${resolved} is not a directory`);
  }

  const entries = await fs.readdir(resolved, { withFileTypes: true });
  const children = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        children.push({ name: entry.name, type: 'directory', skipped: true });
        continue;
      }
      if (depth < MAX_DEPTH) {
        const sub = await scanDirectory(path.join(resolved, entry.name), depth + 1);
        children.push(sub);
      } else {
        children.push({ name: entry.name, type: 'directory', truncated: true });
      }
    } else {
      children.push({
        name: entry.name,
        type: 'file',
        ext: path.extname(entry.name).toLowerCase(),
        size: (await fs.stat(path.join(resolved, entry.name)).catch(() => ({ size: 0 }))).size
      });
    }
  }

  const extensions = new Set();
  collectExtensions(children, extensions);

  return {
    name: path.basename(resolved),
    path: resolved,
    type: 'directory',
    children,
    detectedLanguages: detectLanguages(extensions)
  };
}

function collectExtensions(children, extensions) {
  for (const child of children) {
    if (child.ext) extensions.add(child.ext);
    if (child.children) collectExtensions(child.children, extensions);
  }
}

const LANGUAGE_MAP = {
  '.js': 'Node',
  '.mjs': 'Node',
  '.ts': 'Node',
  '.jsx': 'Node',
  '.tsx': 'Node',
  '.vue': 'Node',
  '.py': 'Python',
  '.rs': 'Rust',
  '.go': 'Go',
  '.java': 'Java',
  '.kt': 'Kotlin',
  '.cs': 'CSharp',
  '.rb': 'Ruby',
  '.php': 'PHP',
  '.swift': 'Swift',
  '.c': 'C',
  '.h': 'C',
  '.cpp': 'C++',
  '.hpp': 'C++',
  '.gd': 'Godot',
  '.qc': 'QuakeC',
};

function detectLanguages(extensions) {
  const langs = new Set();
  for (const ext of extensions) {
    if (LANGUAGE_MAP[ext]) langs.add(LANGUAGE_MAP[ext]);
  }
  return [...langs];
}

module.exports = { scanDirectory };
