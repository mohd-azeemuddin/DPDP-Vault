import 'dotenv/config';
import readline from 'node:readline';
import { handleMcpJsonRpc, type McpJsonRpcRequest } from './src/server/mcpHandler.ts';

// MCP stdio transport: all protocol frames go to stdout; diagnostics must go strictly to stderr.
const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const req = JSON.parse(trimmed) as McpJsonRpcRequest;
    const response = await handleMcpJsonRpc(req);
    if (response !== null) {
      process.stdout.write(`${JSON.stringify(response)}\n`);
    }
  } catch (err) {
    process.stderr.write(
      `[dpdp-vault-mcp] Failed to process stdin frame: ${
        err instanceof Error ? err.message : String(err)
      }\n`,
    );
    process.stdout.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      })}\n`,
    );
  }
});
