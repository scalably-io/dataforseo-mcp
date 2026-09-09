import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fakeChild = path.join(root, 'test', 'fake-child.mjs');
const textOf = (response) => response.result?.content?.find((item) => item.type === 'text')?.text || '';

function client(useFakeChild) {
  const child = spawn(process.execPath, ['dist/index.js'], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: useFakeChild ? 'test' : 'production',
      ...(useFakeChild ? { DATAFORSEO_PROXY_TEST_CHILD: fakeChild } : {}),
      DATAFORSEO_USERNAME: 'inventory@example.com',
      DATAFORSEO_PASSWORD: 'inventory',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let id = 1;
  let buffer = '';
  let stderr = '';
  const pending = new Map();
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    while (buffer.includes('\n')) {
      const index = buffer.indexOf('\n');
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      const waiter = pending.get(message.id);
      if (!waiter) continue;
      clearTimeout(waiter.timer);
      pending.delete(message.id);
      waiter.resolve(message);
    }
  });
  const request = (method, params) => {
    const requestId = id++;
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout ${method}: ${stderr}`)), 20_000);
      pending.set(requestId, { resolve, reject, timer });
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params })}\n`);
    return promise;
  };
  return {
    async init() {
      await request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'proxy-test', version: '1' } });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    },
    list: () => request('tools/list', {}),
    call: (name, args) => request('tools/call', { name, arguments: args }),
    async close() {
      const exited = new Promise((resolve) => child.once('exit', resolve));
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('proxy preserves exact four tools and normalizes all DataForSEO states', async () => {
  const mcp = client(true);
  try {
    await mcp.init();
    const tools = (await mcp.list()).result.tools;
    assert.deepEqual(tools.map((tool) => tool.name).sort(), [
      'api_request', 'docs_index', 'docs_list_sections', 'docs_search',
    ]);

    const docs = JSON.parse(textOf(await mcp.call('docs_list_sections', {})));
    assert.equal(docs.status, 'succeeded');
    assert.equal('schema' in docs, false);
    assert.match(docs.result.data.text, /SERP API/);

    const success = JSON.parse(textOf(await mcp.call('api_request', { method: 'POST', path: '/success', data: [{ keyword: 'x' }], noAiMode: true })));
    assert.equal(success.status, 'succeeded');
    assert.equal(success.proof.costUsd, 0.05);
    assert.equal(success.proof.resultCount, 2);

    const pending = JSON.parse(textOf(await mcp.call('api_request', { method: 'POST', path: '/pending', data: [{}], noAiMode: true })));
    assert.equal(pending.status, 'pending');
    assert.deepEqual(pending.proof.taskIds, ['pending-id']);

    const noOp = JSON.parse(textOf(await mcp.call('api_request', { method: 'GET', path: '/noop', noAiMode: true })));
    assert.equal(noOp.status, 'no_op');

    const partial = JSON.parse(textOf(await mcp.call('api_request', { method: 'POST', path: '/partial', data: [{}, {}], noAiMode: true })));
    assert.equal(partial.status, 'partial');
    assert.equal(partial.proof.tasksError, 1);

    const optimized = JSON.parse(textOf(await mcp.call('api_request', { method: 'GET', path: '/optimized' })));
    assert.equal(optimized.proof.costKnown, false);
    assert.equal(optimized.warnings.length, 2);

    const auth = await mcp.call('api_request', { method: 'GET', path: '/auth' });
    assert.equal(auth.result.isError, true);
    assert.match(textOf(auth), /^authentication_failed: /);

    const unstructured = await mcp.call('api_request', { method: 'GET', path: '/bad-text' });
    assert.equal(unstructured.result.isError, true);
    assert.match(textOf(unstructured), /^invalid_vendor_response: /);
  } finally {
    await mcp.close();
  }
});

test('pinned official child still exposes the expected four-tool contract', async () => {
  const mcp = client(false);
  try {
    await mcp.init();
    const tools = (await mcp.list()).result.tools;
    assert.deepEqual(tools.map((tool) => tool.name).sort(), [
      'api_request', 'docs_index', 'docs_list_sections', 'docs_search',
    ]);
  } finally {
    await mcp.close();
  }
});
