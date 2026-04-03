const { Octokit } = require('octokit');
const simpleGit = require('simple-git');
const path = require('path');

async function validateToken(token) {
  const octokit = new Octokit({ auth: token });
  const { data } = await octokit.rest.users.getAuthenticated();
  return { login: data.login, name: data.name, avatar: data.avatar_url };
}

async function listRepos(token) {
  const octokit = new Octokit({ auth: token });
  const repos = [];
  for await (const response of octokit.paginate.iterator(octokit.rest.repos.listForAuthenticatedUser, {
    sort: 'updated',
    per_page: 100,
  })) {
    for (const repo of response.data) {
      repos.push({
        name: repo.full_name,
        url: repo.clone_url,
        private: repo.private,
        description: repo.description,
      });
    }
  }
  return repos;
}

async function createRepo(token, { name, description, isPrivate }) {
  const octokit = new Octokit({ auth: token });
  try {
    const { data } = await octokit.rest.repos.createForAuthenticatedUser({
      name,
      description: description || '',
      private: isPrivate || false,
      auto_init: false,
    });
    return {
      name: data.full_name,
      url: data.clone_url,
      htmlUrl: data.html_url,
    };
  } catch (err) {
    // If repo already exists, try to recover it
    if (err.status === 422) {
      const user = await octokit.rest.users.getAuthenticated();
      const fullName = `${user.data.login}/${name}`;
      const isEmpty = await checkRepoEmpty(token, fullName);
      if (isEmpty) {
        const { data } = await octokit.rest.repos.get({
          owner: user.data.login,
          repo: name,
        });
        return {
          name: data.full_name,
          url: data.clone_url,
          htmlUrl: data.html_url,
          recovered: true,
        };
      }
    }
    throw err;
  }
}

async function checkRepoEmpty(token, repoFullName) {
  const octokit = new Octokit({ auth: token });
  try {
    await octokit.rest.repos.getContent({
      owner: repoFullName.split('/')[0],
      repo: repoFullName.split('/')[1],
      path: '',
    });
    return false;
  } catch (err) {
    // 404 means empty repo (no commits yet)
    if (err.status === 404) return true;
    throw err;
  }
}

async function pushProject(dirPath, repoUrl, token) {
  const resolved = path.resolve(dirPath);
  const git = simpleGit(resolved);

  // Inject token into URL for auth
  const authedUrl = repoUrl.replace('https://', `https://x-access-token:${token}@`);

  // Init if needed
  const isRepo = await git.checkIsRepo().catch(() => false);
  if (!isRepo) {
    await git.init();
  }

  // Check for existing remote
  const remotes = await git.getRemotes(true);
  const origin = remotes.find(r => r.name === 'origin');
  if (origin) {
    await git.removeRemote('origin');
  }
  await git.addRemote('origin', authedUrl);

  // Stage all files
  await git.add('.');

  const status = await git.status();
  const hasChangesToCommit = status.staged.length > 0;

  if (hasChangesToCommit) {
    await git.commit('Initial commit via Fluxite');
  }

  // Check there's at least one commit to push
  const log = await git.log().catch(() => null);
  if (!log || log.total === 0) {
    throw new Error('No files to upload. The directory is empty or everything is in .gitignore');
  }

  // Ensure we're on main
  const branches = await git.branchLocal();
  if (branches.current !== 'main') {
    await git.branch(['-M', 'main']);
  }

  await git.push('origin', 'main', ['--set-upstream', '--force']);

  // Remove token from remote URL after push
  await git.removeRemote('origin');
  await git.addRemote('origin', repoUrl);

  return { ok: true, message: 'Project pushed successfully' };
}

async function checkLocalChanges(dirPath) {
  const resolved = path.resolve(dirPath);
  const git = simpleGit(resolved);

  const isRepo = await git.checkIsRepo().catch(() => false);
  if (!isRepo) return { isRepo: false, hasChanges: false, summary: '' };

  const status = await git.status();
  const changed = status.modified.length + status.not_added.length + status.deleted.length + status.created.length + status.renamed.length;

  return {
    isRepo: true,
    hasChanges: changed > 0,
    changed,
    modified: status.modified.length,
    created: status.created.length + status.not_added.length,
    deleted: status.deleted.length,
  };
}

module.exports = { validateToken, createRepo, listRepos, pushProject, checkRepoEmpty, checkLocalChanges };
