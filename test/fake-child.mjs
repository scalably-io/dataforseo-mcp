import readline from 'node:readline';

const tools = [
  { name: 'docs_index', description: 'Docs index', inputSchema: { type: 'object', properties: {} } },
  { name: 'docs_list_sections', description: 'Docs sections', inputSchema: { type: 'object', properties: {} } },
  { name: 'docs_search', description: 'Docs search', inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
  { name: 'api_request', description: 'API request', inputSchema: { type: 'object', properties: { method: { type: 'string' }, path: { type: 'string' }, data: {} }, required: ['method'] } },
];

const text = (value, isError = false) => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
  ...(isError ? { isError: true } : {}),
});

function apiResult(path) {
  if (path === '/success') return text({
    status_code: 20000,
    status_message: 'Ok.',
    cost: 0.05,
    tasks_count: 1,
    tasks_error: 0,
    tasks: [{ id: 'success-id', status_code: 20000, status_message: 'Ok.', cost: 0.05, result_count: 2, result: [{ rank: 1 }, { rank: 2 }] }],
  });
  if (path === '/pending') return text({
    status_code: 20000,
    status_message: 'Ok.',
    cost: 0.00125,
    tasks_count: 1,
    tasks_error: 0,
    tasks: [{ id: 'pending-id', status_code: 20100, status_message: 'Task Created.', cost: 0.00125, result_count: 0, result: null }],
  });
  if (path === '/noop') return text({
    status_code: 20000,
    status_message: 'Ok.',
    cost: 0,
    tasks_count: 1,
    tasks_error: 0,
    tasks: [{ id: 'none-id', status_code: 40102, status_message: 'No Search Results.', cost: 0, result_count: 0, result: null }],
  });
  if (path === '/partial') return text({
    status_code: 20000,
    status_message: 'Ok.',
    cost: 0.02,
    tasks_count: 2,
    tasks_error: 1,
    tasks: [
      { id: 'ok-id', status_code: 20000, status_message: 'Ok.', cost: 0.01, result_count: 1, result: [{ value: 1 }] },
      { id: 'bad-id', status_code: 40501, status_message: 'Invalid Field.', cost: 0.01, result_count: 0, result: null },
    ],
  });
  if (path === '/optimized') return text({ status_code: 20000, status_message: 'Ok.', items: [{ rank: 1 }] });
  if (path === '/auth') return text({ status_code: 40100, status_message: 'Unauthorized.', items: [] }, true);
  if (path === '/bad-text') return text('vendor returned prose', true);
  return text({ status_code: 40402, status_message: 'Invalid Path.', items: [] }, true);
}

const lines = readline.createInterface({ input: process.stdin });
lines.on('line', (line) => {
  const request = JSON.parse(line);
  if (request.method === 'notifications/initialized') return;
  let result;
  if (request.method === 'initialize') {
    result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'fake-dataforseo', version: '1' } };
  } else if (request.method === 'tools/list') {
    result = { tools };
  } else if (request.method === 'tools/call') {
    result = request.params.name.startsWith('docs_')
      ? text('- SERP API\n- Appendix')
      : apiResult(request.params.arguments?.path);
  } else {
    process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'unknown method' } })}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, result })}\n`);
});
