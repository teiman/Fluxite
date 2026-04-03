const fs = require('fs/promises');
const path = require('path');
const os = require('os');

const TOKEN_DIR = path.join(os.homedir(), '.fluxite');
const TOKEN_FILE = path.join(TOKEN_DIR, 'token.json');

async function readToken() {
  try {
    const data = await fs.readFile(TOKEN_FILE, 'utf-8');
    return JSON.parse(data).token || null;
  } catch {
    return null;
  }
}

async function writeToken(token) {
  await fs.mkdir(TOKEN_DIR, { recursive: true });
  await fs.writeFile(TOKEN_FILE, JSON.stringify({ token }), 'utf-8');
}

module.exports = { readToken, writeToken };
