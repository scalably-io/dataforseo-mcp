import assert from 'node:assert/strict';
import { test } from 'node:test';

import { childFailureResult, normalizeVendorResult } from '../dist/normalize.js';

const vendor = (value, isError = false) => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }],
  ...(isError ? { isError: true } : {}),
});

function parsed(result) {
  return JSON.parse(result.content[0].text);
}

test('normalizes success, pending, no-result and partial DataForSEO task envelopes', () => {
  const success = parsed(normalizeVendorResult('api_request', { method: 'POST', path: '/x' }, vendor({
    status_code: 20000, cost: 0.1, tasks_error: 0,
    tasks: [{ id: 'a', status_code: 20000, cost: 0.1, result_count: 2, result: [{}, {}] }],
  })));
  assert.equal(success.status, 'succeeded');
  assert.equal('schema' in success, false);
  assert.equal('changed' in success, false);
  assert.equal(success.proof.costUsd, 0.1);
  assert.equal(success.proof.resultCount, 2);

  const pending = parsed(normalizeVendorResult('api_request', { method: 'POST', path: '/x/task_post' }, vendor({
    status_code: 20000, cost: 0.00125,
    tasks: [{ id: 'pending', status_code: 20100, cost: 0.00125, result_count: 0, result: null }],
  })));
  assert.equal(pending.status, 'pending');
  assert.deepEqual(pending.proof.taskIds, ['pending']);

  const noOp = parsed(normalizeVendorResult('api_request', { method: 'GET', path: '/x' }, vendor({
    status_code: 20000, cost: 0,
    tasks: [{ id: 'none', status_code: 40102, cost: 0, result_count: 0, result: null }],
  })));
  assert.equal(noOp.status, 'no_op');

  const partial = parsed(normalizeVendorResult('api_request', { method: 'POST', path: '/x' }, vendor({
    status_code: 20000, cost: 0.2, tasks_error: 1,
    tasks: [
      { id: 'ok', status_code: 20000, cost: 0.1, result_count: 1, result: [{}] },
      { id: 'bad', status_code: 40501, cost: 0.1, result_count: 0, result: null },
    ],
  })));
  assert.equal(partial.status, 'partial');
  assert.equal(partial.warnings.length, 1);
});

test('maps vendor errors and optimized proof without inventing cost', () => {
  const auth = normalizeVendorResult('api_request', { method: 'GET', path: '/x' }, vendor({ status_code: 40100, status_message: 'Unauthorized', items: [] }, true));
  assert.equal(auth.isError, true);
  assert.match(auth.content[0].text, /^authentication_failed: .* Correct the DataForSEO API login\/password before retrying\.$/);

  const optimized = parsed(normalizeVendorResult('api_request', { method: 'GET', path: '/x' }, vendor({ status_code: 20000, status_message: 'Ok', items: [{ value: 1 }] })));
  assert.equal(optimized.status, 'succeeded');
  assert.equal(optimized.proof.costKnown, false);
  assert.equal(optimized.proof.costUsd, null);
  assert.equal(optimized.warnings.length, 2);
});

test('child failure is fail-closed and marks paid request execution ambiguous', () => {
  const result = childFailureResult('api_request', { method: 'POST', path: '/v3/serp/x' }, 'exited');
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /^ambiguous_paid_request: /);
  assert.equal(result.content[0].text.includes('"schema"'), false);
});
