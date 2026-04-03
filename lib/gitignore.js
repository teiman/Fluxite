const fs = require('fs/promises');
const path = require('path');
const { scanDirectory } = require('./scanner');

const TEMPLATES = {
  Node: [
    'node_modules/',
    'dist/',
    '.env',
    '*.log',
    'npm-debug.log*',
    '.DS_Store',
    'Thumbs.db',
  ],
  Python: [
    '__pycache__/',
    '*.py[cod]',
    '*$py.class',
    '*.so',
    '.env',
    'venv/',
    '.venv/',
    'dist/',
    '*.egg-info/',
  ],
  Rust: [
    'target/',
    'Cargo.lock',
  ],
  Go: [
    'bin/',
    '*.exe',
    '*.test',
  ],
  Java: [
    '*.class',
    '*.jar',
    'build/',
    '.gradle/',
    'target/',
  ],
  CSharp: [
    'bin/',
    'obj/',
    '*.suo',
    '*.user',
    '.vs/',
  ],
  Godot: [
    '.godot/',
    '*.import',
    'export_presets.cfg',
  ],
  QuakeC: [
    'progs.dat',
    'progs.lno',
    '*.exe',
    '*.dll',
    '*.pak',
  ],
  _common: [
    '.DS_Store',
    'Thumbs.db',
    '*.swp',
    '*~',
    '.claude/',
    '.cursor/',
    '.vscode/',
    '.idea/',
  ],
};

async function generateGitignore(dirPath) {
  const tree = await scanDirectory(dirPath, 0);
  const langs = tree.detectedLanguages || [];
  const lines = new Set();

  // Always add common
  for (const line of TEMPLATES._common) lines.add(line);

  for (const lang of langs) {
    if (TEMPLATES[lang]) {
      for (const line of TEMPLATES[lang]) lines.add(line);
    }
  }

  return [...lines].join('\n') + '\n';
}

async function readGitignore(dirPath) {
  const filePath = path.join(path.resolve(dirPath), '.gitignore');
  return await fs.readFile(filePath, 'utf-8');
}

async function writeGitignore(dirPath, content) {
  const filePath = path.join(path.resolve(dirPath), '.gitignore');
  await fs.writeFile(filePath, content, 'utf-8');
}

async function suggestMissing(dirPath) {
  const tree = await scanDirectory(dirPath, 0);
  const langs = tree.detectedLanguages || [];
  const recommended = new Set();

  for (const line of TEMPLATES._common) recommended.add(line);
  for (const lang of langs) {
    if (TEMPLATES[lang]) {
      for (const line of TEMPLATES[lang]) recommended.add(line);
    }
  }

  let existing = '';
  try {
    existing = await readGitignore(dirPath);
  } catch {}

  const missing = [];
  for (const rule of recommended) {
    // Check if the rule (or a close variant) is already present
    const normalized = rule.replace(/\/$/, '');
    const alreadyPresent = existing.split('\n').some(line => {
      const l = line.trim().replace(/\/$/, '');
      return l === normalized || l === rule;
    });
    if (!alreadyPresent) {
      missing.push(rule);
    }
  }

  return missing;
}

module.exports = { generateGitignore, readGitignore, writeGitignore, suggestMissing };
