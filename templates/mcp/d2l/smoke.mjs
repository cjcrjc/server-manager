import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client({ name: 'learn-smoke', version: '1.0.0' });
const transport = new StdioClientTransport({ command: process.execPath, args: [new URL('./server.mjs', import.meta.url).pathname], stderr: 'pipe' });
try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.ok(tools.length >= 11);
  const result = await client.callTool({ name: 'learn_status', arguments: {} });
  assert.equal(result.isError, undefined);
  const status = JSON.parse(result.content[0].text);
  assert.ok(status.versions.lp);
  assert.ok(status.versions.le);
  console.log(JSON.stringify({ handshake: 'ok', tools: tools.map(t => t.name), status }, null, 2));
} finally {
  await client.close();
}
