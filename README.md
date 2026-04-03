# Fluxite

A local web interface that makes uploading projects to GitHub simple. No terminal commands, no git knowledge required — just point to a folder and push.

## What it does

Fluxite runs a local web server with a step-by-step wizard that handles the entire process of getting a project folder onto GitHub:

1. **Scan** — Select a local folder. Fluxite reads its structure and detects programming languages.
2. **Gitignore** — Automatically generates a `.gitignore` based on detected languages and suggests missing rules. You can edit it before saving.
3. **Authenticate** — Enter a GitHub Personal Access Token (PAT). It's saved locally so you only need to do this once.
4. **Repository** — Create a new GitHub repo or select an existing one from your account.
5. **Push** — Upload the project. Fluxite initializes git, commits all files, and pushes to the selected repo.

If something goes wrong mid-process (network error, push failure), Fluxite recovers gracefully — it detects empty repos from previous failed attempts and reuses them instead of failing.

## Requirements

- [Node.js](https://nodejs.org/) (v18 or later)
- A GitHub [Personal Access Token](https://github.com/settings/tokens) with `repo` scope

## Setup

```bash
git clone https://github.com/your-username/fluxite.git
cd fluxite
npm install
```

## Usage

```bash
npm start
```

The browser opens automatically at `http://localhost:3847`. Follow the wizard to upload your project.

## How the token is stored

The GitHub PAT is saved to `~/.fluxite/token.json` so you don't have to re-enter it each session. The token is temporarily injected into the git remote URL during push and removed immediately after.

## License

MIT
