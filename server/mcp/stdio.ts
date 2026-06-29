import { createInterface } from 'node:readline';

import { HermesMcpBridge } from './bridge.js';

const bridge = new HermesMcpBridge({
  baseUrl: process.env.HERMES_AGENT_BASE_URL ?? 'http://127.0.0.1:3000',
  token: process.env.HERMES_AGENT_TOKEN,
});

const lines = createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
  terminal: false,
});

function write(message: unknown): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

for await (const line of lines) {
  if (!line.trim()) continue;
  try {
    const response = await bridge.handle(JSON.parse(line));
    if (response) write(response);
  } catch (error) {
    write({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: error instanceof SyntaxError ? 'Parse error' : 'Internal error',
      },
    });
    if (!(error instanceof SyntaxError)) {
      console.error('[hermes-mcp]', error instanceof Error ? error.message : String(error));
    }
  }
}
