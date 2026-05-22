#!/usr/bin/env node
'use strict';

const http = require('http');

const BRIDGE_HOST = '127.0.0.1';
const BASE_PORT = 19876;
const HTTP_TIMEOUT = 55_000;

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
    setTimeout(() => resolve(data), 5000);
  });
}

function sendHookRequest(port, body) {
  return new Promise((resolve) => {
    const postData = JSON.stringify(body);
    const req = http.request({
      hostname: BRIDGE_HOST,
      port,
      path: '/hook',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
      timeout: HTTP_TIMEOUT
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch {
          resolve({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } });
        }
      });
    });

    req.on('error', (err) => {
      console.error(`[hook-script] HTTP error: ${err.message}`);
      resolve({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'hook script HTTP timeout' } });
    });

    req.write(postData);
    req.end();
  });
}

const ALLOW_RESPONSE = JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } });

async function main() {
  const stdin = await readStdin();
  if (!stdin.trim()) {
    process.stdout.write(ALLOW_RESPONSE + '\n');
    return;
  }

  let hookData;
  try { hookData = JSON.parse(stdin); } catch {
    process.stdout.write(ALLOW_RESPONSE + '\n');
    return;
  }

  const response = await sendHookRequest(BASE_PORT, hookData);
  process.stdout.write(JSON.stringify(response) + '\n');
}

main().catch(() => {
  process.stdout.write(ALLOW_RESPONSE + '\n');
});
