'use strict';

const fs = require('fs');
const { spawnSync } = require('child_process');

const target = process.argv[2];
const python = fs.existsSync('/usr/bin/python3') ? '/usr/bin/python3' : undefined;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      ...(python ? { PYTHON: python } : {}),
      ...options.env
    }
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

if (target === 'node') {
  run('npm', ['rebuild', 'better-sqlite3']);
} else if (target === 'electron') {
  run('npx', ['electron-rebuild', '-f', '-w', 'better-sqlite3']);
} else {
  console.error('Usage: node scripts/rebuild-native.js <node|electron>');
  process.exit(1);
}
