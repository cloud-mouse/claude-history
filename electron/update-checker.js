'use strict';

/**
 * Signing-independent update check (function: startup update modal).
 *
 * Instead of electron-updater (which requires code signing on macOS), we simply
 * fetch the latest GitHub release and compare versions. The UI opens a browser
 * to download, so this works on ALL platforms — including unsigned mac builds.
 */

const pkg = require('../package.json');
const REPO = 'cloud-mouse/claude-history';
const CURRENT_VERSION = pkg.version;

async function fetchLatest() {
  const url = `https://api.github.com/repos/${REPO}/releases/latest`;
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'claude-history-updater', Accept: 'application/vnd.github+json' }
  });
  if (!resp.ok) throw new Error(`GitHub API ${resp.status}`);
  const data = await resp.json();
  const version = String(data.tag_name || '').replace(/^v/, '');
  return {
    version,
    name: data.name || '',
    notes: data.body || '',
    publishedAt: data.published_at || '',
    htmlUrl: data.html_url || '',
    assets: (data.assets || []).map((a) => ({ name: a.name, url: a.browser_download_url, size: a.size }))
  };
}

/** True if `latest` is newer than `current` (semver-ish compare). */
function isNewer(current, latest) {
  if (!latest) return false;
  const pa = String(current).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(latest).split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    if ((pb[i] || 0) > (pa[i] || 0)) return true;
    if ((pb[i] || 0) < (pa[i] || 0)) return false;
  }
  return false;
}

/** Pick the recommended download asset for the running platform. */
function pickAsset(assets) {
  if (!Array.isArray(assets) || !assets.length) return null;
  const platform = process.platform;
  if (platform === 'darwin') {
    const arch = process.arch;
    const armDmg = assets.find((a) => /\.dmg$/i.test(a.name) && /arm64/i.test(a.name));
    const x64Dmg = assets.find((a) => /\.dmg$/i.test(a.name) && !/arm64/i.test(a.name));
    const anyDmg = assets.find((a) => /\.dmg$/i.test(a.name));
    if (arch === 'arm64') return armDmg || anyDmg || x64Dmg;
    return x64Dmg || anyDmg || armDmg;
  }
  if (platform === 'win32') {
    return assets.find((a) => /\.exe$/i.test(a.name));
  }
  return assets.find((a) => /\.AppImage$/i.test(a.name));
}

module.exports = { fetchLatest, isNewer, pickAsset, CURRENT_VERSION, REPO };
