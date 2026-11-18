/**
 * @description bench-cataloging CLI flag parsing (#773).
 *
 * `numFlag` reads the value that follows a `--flag`, so a flag at the end of
 * argv used to index one past the end of `process.argv`. These tests pin the
 * bounds check, the existing fallbacks, the untouched defaults and the fact
 * that `--json` stays a bare flag.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { numFlag, DURATION_MS, WARMUP_MS } from '../scripts/bench-cataloging.mjs';

/** Runs `fn` with `process.argv` replaced, restoring it afterwards. */
function withArgv(argv, fn) {
  const saved = process.argv.slice();
  process.argv.splice(0, process.argv.length, ...argv);
  try {
    return fn();
  } finally {
    process.argv.splice(0, process.argv.length, ...saved);
  }
}

test('a trailing --duration-ms falls back instead of indexing past argv', () => {
  const value = withArgv(['node', 'bench-cataloging.mjs', '--duration-ms'], () =>
    numFlag('duration-ms', 5000),
  );

  assert.equal(value, 5000);
});

test('a trailing --warmup-ms falls back instead of indexing past argv', () => {
  const value = withArgv(['node', 'bench-cataloging.mjs', '--warmup-ms'], () =>
    numFlag('warmup-ms', 1500),
  );

  assert.equal(value, 1500);
});

test('a trailing flag falls back even when other flags precede it', () => {
  const value = withArgv(
    ['node', 'bench-cataloging.mjs', '--warmup-ms', '500', '--json', '--duration-ms'],
    () => numFlag('duration-ms', 5000),
  );

  assert.equal(value, 5000);
});

test('valid positive values are parsed', () => {
  withArgv(['node', 'bench-cataloging.mjs', '--duration-ms', '250', '--warmup-ms', '20'], () => {
    assert.equal(numFlag('duration-ms', 5000), 250);
    assert.equal(numFlag('warmup-ms', 1500), 20);
  });
});

test('unusable values fall back: zero, negative, non-numeric and another flag', () => {
  withArgv(
    ['node', 'bench-cataloging.mjs', '--duration-ms', '0', '--warmup-ms', '-5', '--json'],
    () => {
      assert.equal(numFlag('duration-ms', 5000), 5000);
      assert.equal(numFlag('warmup-ms', 1500), 1500);
      assert.equal(numFlag('json', 1500), 1500, '--json has no numeric value to read');
    },
  );

  withArgv(['node', 'bench-cataloging.mjs', '--duration-ms', 'soon'], () => {
    assert.equal(numFlag('duration-ms', 5000), 5000);
  });
});

test('an absent flag returns the caller fallback', () => {
  withArgv(['node', 'bench-cataloging.mjs', '--json'], () => {
    assert.equal(numFlag('duration-ms', 5000), 5000);
    assert.equal(numFlag('warmup-ms', 1500), 1500);
  });
});

test('the module keeps its documented defaults and --json stays a bare flag', () => {
  // Under `node --test` argv carries no benchmark flags, so the constants are
  // the defaults the CLI advertises.
  assert.equal(DURATION_MS, 5000);
  assert.equal(WARMUP_MS, 1500);
  withArgv(['node', 'bench-cataloging.mjs', '--json'], () => {
    assert.equal(
      numFlag('json', 1500),
      1500,
      '--json is read with includes(), so it must not consume the next argument',
    );
  });
});
