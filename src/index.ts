#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { childFailureResult, normalizeVendorResult } from './normalize.js';

/** Resolve the pinned dataforseo-mcp-server dependency through Node's own module
 * resolution (not a fixed node_modules/.bin path), so this still finds the child
 * whether npm hoists it to the top of the install tree or nests it under this
 * package, which is how npm actually lays out a published package's dependencies. */
function resolveChildScript(): string {
  const require = createRequire(import.meta.url);
  const childPackageJsonPath = require.resolve('dataforseo-mcp-server/package.json');
  const childPackageJson = JSON.parse(readFileSync(childPackageJsonPath, 'utf8'));
  const bin = childPackageJson.bin;
  const entry = typeof bin === 'string' ? bin : bin?.['dataforseo-mcp-server'];
  if (!entry) throw new Error('dataforseo-mcp-server package.json has no bin entry');
  return path.join(path.dirname(childPackageJsonPath), entry);
}

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: any;
  result?: any;
  error?: any;
  [key: string]: unknown;
}

interface PendingRequest {
  method: string;
  toolName: string;
  args: Record<string, unknown>;
}

const testChild = process.env.NODE_ENV === 'test'
  ? process.env.DATAFORSEO_PROXY_TEST_CHILD
  : undefined;
const command = process.execPath;
const args = [testChild ?? resolveChildScript()];
const child = spawn(command, args, {
  env: process.env,
  stdio: ['pipe', 'pipe', 'pipe'],
});

const pending = new Map<string, PendingRequest>();
let shuttingDown = false;
const requestKey = (id: string | number | null | undefined) => JSON.stringify(id);

function record(message: JsonRpcMessage): void {
  if (message.id === undefined || message.id === null || !message.method) return;
  const toolCall = message.method === 'tools/call';
  pending.set(requestKey(message.id), {
    method: message.method,
    toolName: toolCall && typeof message.params?.name === 'string' ? message.params.name : '',
    args: toolCall && message.params?.arguments && typeof message.params.arguments === 'object'
      ? message.params.arguments
      : {},
  });
}

function forwardParentMessage(value: unknown, rawLine: string): void {
  if (Array.isArray(value)) value.forEach((item) => record(item as JsonRpcMessage));
  else if (value && typeof value === 'object') record(value as JsonRpcMessage);
  child.stdin.write(`${rawLine}\n`);
}

function wrapResponse(message: JsonRpcMessage): JsonRpcMessage {
  if (message.id === undefined || message.id === null) return message;
  const key = requestKey(message.id);
  const request = pending.get(key);
  pending.delete(key);
  if (!request || request.method !== 'tools/call' || !message.result) return message;
  return {
    ...message,
    result: normalizeVendorResult(request.toolName, request.args, message.result),
  };
}

function emit(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

let parentBuffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  parentBuffer += chunk;
  while (parentBuffer.includes('\n')) {
    const index = parentBuffer.indexOf('\n');
    const line = parentBuffer.slice(0, index).trim();
    parentBuffer = parentBuffer.slice(index + 1);
    if (!line) continue;
    try {
      forwardParentMessage(JSON.parse(line), line);
    } catch (error) {
      process.stderr.write(`[dataforseo-proxy] rejected invalid parent JSON: ${String(error)}\n`);
    }
  }
});

let childBuffer = '';
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  childBuffer += chunk;
  while (childBuffer.includes('\n')) {
    const index = childBuffer.indexOf('\n');
    const line = childBuffer.slice(0, index).trim();
    childBuffer = childBuffer.slice(index + 1);
    if (!line) continue;
    try {
      const parsed = JSON.parse(line);
      emit(Array.isArray(parsed) ? parsed.map((item) => wrapResponse(item)) : wrapResponse(parsed));
    } catch (error) {
      process.stderr.write(`[dataforseo-proxy] child emitted invalid JSON: ${String(error)}\n`);
    }
  }
});

child.stderr.setEncoding('utf8');
child.stderr.on('data', (chunk) => {
  process.stderr.write(`[dataforseo-child] ${chunk}`);
});

function failPending(message: string): void {
  for (const [key, request] of pending) {
    const id = JSON.parse(key);
    if (request.method === 'tools/call') {
      emit({
        jsonrpc: '2.0',
        id,
        result: childFailureResult(request.toolName, request.args, message),
      });
    } else {
      emit({ jsonrpc: '2.0', id, error: { code: -32000, message } });
    }
  }
  pending.clear();
}

child.on('error', (error) => failPending(`could not start pinned child: ${error.message}`));
child.on('exit', (code, signal) => {
  failPending(`pinned child exited (code=${String(code)}, signal=${String(signal)})`);
  process.stdin.pause();
  setImmediate(() => process.exit(shuttingDown ? 0 : (code ?? 1)));
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    shuttingDown = true;
    if (!child.killed) child.kill(signal);
  });
}

process.stdin.on('end', () => {
  shuttingDown = true;
  if (!child.killed) child.kill('SIGTERM');
});
