const fs = require('fs/promises');
const path = require('path');
const simpleGit = require('simple-git');

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svn', '__pycache__', '.godot',
  'dist', 'build', '.next', '.nuxt', 'target', 'bin', 'obj',
  '.claude', '.cursor', '.vscode', '.idea',
]);

/**
 * Search a directory tree for git repos whose remote matches the given GitHub username.
 * onProgress({ foldersScanned, gitReposFound, matchesFound, currentDir }) is called during scan.
 * onMatch(result) is called each time a matching project is found.
 */
async function searchProjects(rootDir, githubLogin, maxDepth = 3, { onProgress, onMatch } = {}) {
  const resolved = path.resolve(rootDir);
  const stats = { foldersScanned: 0, gitReposFound: 0, matchesFound: 0 };
  const results = [];
  await walk(resolved, githubLogin, results, 0, maxDepth, stats, onProgress, onMatch);
  return results;
}

async function walk(dir, login, results, depth, maxDepth, stats, onProgress, onMatch) {
  if (depth > maxDepth) return;

  stats.foldersScanned++;

  // Throttle progress to avoid flooding — emit every 5 folders
  if (onProgress && stats.foldersScanned % 5 === 0) {
    onProgress({ ...stats, currentDir: dir });
  }

  // Check if this directory is a git repo with a matching remote
  const gitDir = path.join(dir, '.git');
  try {
    const stat = await fs.stat(gitDir);
    if (stat.isDirectory()) {
      stats.gitReposFound++;
      const match = await checkRemote(dir, login);
      if (match) {
        stats.matchesFound++;
        results.push(match);
        if (onMatch) onMatch(match);
      }
      if (onProgress) onProgress({ ...stats, currentDir: dir });
      // Don't recurse into git repos
      return;
    }
  } catch {
    // Not a git repo, continue scanning
  }

  // Recurse into subdirectories
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    await walk(path.join(dir, entry.name), login, results, depth + 1, maxDepth, stats, onProgress, onMatch);
  }
}

async function checkRemote(dir, login) {
  try {
    const git = simpleGit(dir);
    const remotes = await git.getRemotes(true);
    const origin = remotes.find(r => r.name === 'origin');
    if (!origin || !origin.refs.push) return null;

    const url = origin.refs.push;
    // Match github.com/LOGIN/repo patterns
    const pattern = new RegExp(`github\\.com[/:]${escapeRegex(login)}/([^/.]+)`, 'i');
    const m = url.match(pattern);
    if (!m) return null;

    const repoName = `${login}/${m[1]}`;
    const branches = await git.branchLocal();

    return {
      dirPath: dir,
      repoName,
      repoUrl: normalizeUrl(url),
      branch: branches.current,
    };
  } catch {
    return null;
  }
}

function normalizeUrl(url) {
  // Convert git@ to https://
  if (url.startsWith('git@')) {
    return url.replace('git@github.com:', 'https://github.com/').replace(/\.git$/, '') + '.git';
  }
  return url;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { searchProjects };
