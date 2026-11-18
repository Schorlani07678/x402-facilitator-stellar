/**
 * @description rpcClient timeout cleanup when the child exits (#771).
 *
 * The examples smoke test speaks JSON-RPC to the MCP server over a child's
 * stdio. Every request arms a 15-second timeout; if that handle outlives the
 * child, a crashed server keeps the smoke script's event loop alive for the
 * rest of the timeout even though the failure is already known. These tests
 * pin both halves: a pending entry carries its handle, and the exit path
 * clears it so the process can exit immediately.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rpcClient } from '../scripts/smoke-examples.mjs';

const SCRIPT_URL = new URL('../scripts/smoke-examples.mjs', import.meta.url).href;
const TIMEOUT_BUDGET_MS = 5000;

/** A child that exits by itself, so the exit path — not a kill — fires. */
function dyingChild(code, delayMs = 50) {
  return spawn(process.execPath, ['-e', `setTimeout(() => process.exit(${code}), ${delayMs})`], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

test('a child exit rejects a pending request immediately', async () => {
  const child = dyingChild(7);
  const send = rpcClient(child);

  const started = Date.now();
  await assert.rejects(send('initialize', {}), /MCP server exited with code 7/);
  const elapsed = Date.now() - started;

  assert.ok(
    elapsed < TIMEOUT_BUDGET_MS,
    `the exit path rejected after ${elapsed}ms; it must not wait out the 15s request timeout`,
  );
});

test('a child exit rejects every pending request and clears its timer', async () => {
  const child = dyingChild(3);
  const send = rpcClient(child);

  // Both requests are in flight when the child dies, so both entries must be
  // rejected by the exit handler rather than by their own timeouts.
  const results = await Promise.allSettled([send('initialize', {}), send('tools/list', {})]);

  for (const result of results) {
    assert.equal(result.status, 'rejected');
    assert.match(result.reason.message, /MCP server exited with code 3/);
  }
});

test('a process using rpcClient exits without waiting for the 15s timeout', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-timer-'));
  const helper = path.join(dir, 'helper.mjs');
  fs.writeFileSync(
    helper,
    `import { spawn } from 'node:child_process';
import { rpcClient } from ${JSON.stringify(SCRIPT_URL)};

const child = spawn(process.execPath, ['-e', 'setTimeout(() => process.exit(5), 50)'], {
  stdio: ['pipe', 'pipe', 'pipe'],
});
try {
  await rpcClient(child)('initialize', {});
} catch (err) {
  console.log(err.message);
}
`,
  );

  const started = Date.now();
  let stdout;
  try {
    // A 15s timer would still be pending here; the timeout makes that case a
    // loud failure rather than a slow test.
    stdout = execFileSync(process.execPath, [helper], { encoding: 'utf8', timeout: 12_000 });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const elapsed = Date.now() - started;

  assert.match(stdout, /MCP server exited with code 5/);
  assert.ok(
    elapsed < TIMEOUT_BUDGET_MS,
    `the helper process took ${elapsed}ms to exit; a cleared timer must let it exit at once`,
  );
});
