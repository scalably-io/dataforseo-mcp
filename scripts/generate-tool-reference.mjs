import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const childPath = process.platform === 'win32'
  ? path.join(root, 'node_modules', '.bin', 'dataforseo-mcp-server.cmd')
  : path.join(root, 'node_modules', '.bin', 'dataforseo-mcp-server');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', 'dataforseo-mcp-server', 'package.json'), 'utf8'));

async function listTools() {
  const child = spawn(childPath, [], {
    env: { ...process.env, DATAFORSEO_USERNAME: 'inventory@example.com', DATAFORSEO_PASSWORD: 'inventory' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let nextId = 1;
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
      let message;
      try { message = JSON.parse(line); } catch { continue; }
      const waiter = pending.get(message.id);
      if (!waiter) continue;
      clearTimeout(waiter.timer);
      pending.delete(message.id);
      waiter.resolve(message);
    }
  });
  const request = (method, params) => {
    const id = nextId++;
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout ${method}: ${stderr.slice(-2000)}`)), 20_000);
      pending.set(id, { resolve, reject, timer });
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    return promise;
  };
  try {
    await request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'reference-generator', version: '1' } });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    return (await request('tools/list', {})).result.tools;
  } finally {
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM');
    await exited;
  }
}

const tools = await listTools();
const expected = ['api_request', 'docs_index', 'docs_list_sections', 'docs_search'];
const actual = tools.map((tool) => tool.name).sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error(`Unexpected DataForSEO ${packageJson.version} tool surface: ${actual.join(', ')}`);
}

const manifest = {
  package: 'dataforseo-mcp-server',
  packageVersion: packageJson.version,
  source: 'https://github.com/dataforseo/mcp-server-typescript',
  tools,
};
fs.writeFileSync(path.join(root, 'tool-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Regenerated tool-manifest.json against the pinned DataForSEO ${packageJson.version} four-tool surface.`);
