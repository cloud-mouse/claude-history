#!/usr/bin/env node
'use strict';

const http = require('http');

const BRIDGE_HOST = '127.0.0.1';
const BASE_PORT = 19876;
const PORT = parseInt(process.env.FEISHU_HOOK_PORT, 10) || BASE_PORT;
const AUTH_TOKEN = process.env.FEISHU_HOOK_TOKEN || '';
const HTTP_TIMEOUT = 55_000;

// Sensitive tools must be denied if we cannot reach the confirmation bridge.
const SENSITIVE_TOOLS = ['Bash', 'Write', 'Edit', 'MultiEdit'];

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

function denyResponse(reason) {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason || 'hook script cannot reach bridge' } };
}

function allowResponse() {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } };
}

function sendHookRequest(port, body) {
  return new Promise((resolve) => {
    const postData = JSON.stringify(body);
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) };
    if (AUTH_TOKEN) headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
    const req = http.request({
      hostname: BRIDGE_HOST,
      port,
      path: '/hook',
      method: 'POST',
      headers,
      timeout: HTTP_TIMEOUT
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(fallbackFor(body)); }
      });
    });

    req.on('error', (err) => {
      console.error(`[hook-script] HTTP error: ${err.message}`);
      resolve(fallbackFor(body));
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(fallbackFor(body, 'hook script HTTP timeout'));
    });

    req.write(postData);
    req.end();
  });
}

// When the bridge is unreachable we cannot confirm, so sensitive tools are
// denied (fail-closed) while harmless reads still proceed.
function fallbackFor(body, reason) {
  const toolName = body && body.tool_name;
  return SENSITIVE_TOOLS.includes(toolName) ? denyResponse(reason) : allowResponse();
}

async function main() {
  const stdin = await readStdin();
  if (!stdin.trim()) {
    process.stdout.write(JSON.stringify(allowResponse()) + '\n');
    return;
  }

  let hookData;
  try { hookData = JSON.parse(stdin); }
  catch {
    // Cannot parse → cannot know the tool → deny (sensitive-safe default).
    process.stdout.write(JSON.stringify(denyResponse('malformed hook stdin')) + '\n');
    return;
  }

  const response = await sendHookRequest(PORT, hookData);
  process.stdout.write(JSON.stringify(response) + '\n');
}

main().catch(() => {
  process.stdout.write(JSON.stringify(denyResponse('hook script crashed')) + '\n');
});
