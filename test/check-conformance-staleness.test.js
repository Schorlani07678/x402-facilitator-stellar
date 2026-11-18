/**
 * @description Conformance marker parsing, including SHA casing (#772).
 *
 * The staleness gate requires a recorded facilitator commit in
 * docs/CONFORMANCE.md. A SHA pasted from a web UI or terminal is often
 * uppercase, and the parser used to accept lowercase hex only — so a valid
 * marker was reported as missing. These tests pin case-insensitive matching,
 * lowercase normalization, and the untouched threshold/default behaviour.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMarkers } from '../scripts/check-conformance-staleness.mjs';

const LOWER = '5f1bd15aec8ca3c6390689ed7fed82506f6c3d8e';
const UPPER = LOWER.toUpperCase();
const MIXED = '5f1bD15AEc8ca3C6390689ED7fEd82506f6C3D8e';

/** Builds a report body containing the SHA marker (and optional extras). */
function report(sha, extra = '') {
  return `# Conformance\n\n<!-- conformance-facilitator-sha: ${sha} -->\n${extra}`;
}

test('a lowercase anchor parses and stays lowercase', () => {
  const { anchorSha } = parseMarkers(report(LOWER));

  assert.equal(anchorSha, LOWER);
});

test('an uppercase anchor parses and is normalized to lowercase', () => {
  const { anchorSha } = parseMarkers(report(UPPER));

  assert.equal(anchorSha, LOWER, 'an uppercase SHA must not be rejected as a missing marker');
  assert.match(anchorSha, /^[0-9a-f]+$/, 'the anchor must be lowercase for git comparisons');
});

test('a mixed-case anchor parses and is normalized to lowercase', () => {
  const { anchorSha } = parseMarkers(report(MIXED));

  assert.equal(anchorSha, LOWER);
});

test('short (abbreviated) anchors keep their casing normalized', () => {
  assert.equal(parseMarkers(report(LOWER.slice(0, 7))).anchorSha, LOWER.slice(0, 7));
  assert.equal(parseMarkers(report(UPPER.slice(0, 7))).anchorSha, LOWER.slice(0, 7));
});

test('surrounding whitespace inside the marker is tolerated', () => {
  const { anchorSha } = parseMarkers(`<!--   conformance-facilitator-sha:   ${UPPER}   -->`);

  assert.equal(anchorSha, LOWER);
});

test('a missing SHA marker yields no anchor', () => {
  const { anchorSha } = parseMarkers('# Conformance\n\nNo marker here.\n');

  assert.equal(anchorSha, null);
});

test('a non-hex anchor is not accepted as a marker', () => {
  const { anchorSha } = parseMarkers(report('ZZZZZZZZ'));

  assert.equal(anchorSha, null);
});

test('the threshold marker is untouched, and defaults to 50 when absent', () => {
  assert.equal(parseMarkers(report(LOWER)).threshold, 50);
  assert.equal(
    parseMarkers(report(LOWER, '<!-- conformance-staleness-threshold: 7 -->')).threshold,
    7,
  );
  assert.equal(
    parseMarkers(report(UPPER, '<!-- conformance-staleness-threshold: 250 -->')).anchorSha,
    LOWER,
  );
});

test('the checked-in conformance report parses to a lowercase anchor', () => {
  const text = readFileSync(new URL('../docs/CONFORMANCE.md', import.meta.url), 'utf8');
  const { anchorSha, threshold } = parseMarkers(text);

  assert.match(anchorSha ?? '', /^[0-9a-f]{7,40}$/);
  assert.ok(Number.isInteger(threshold) && threshold > 0);
});
