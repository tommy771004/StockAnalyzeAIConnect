import { describe, expect, it, vi } from 'vitest';

import { HermesMcpBridge, MCP_PROTOCOL_VERSION } from '../bridge.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Hermes MCP stdio bridge', () => {
  it('negotiates MCP and advertises only the tools capability', async () => {
    const bridge = new HermesMcpBridge({
      baseUrl: 'http://127.0.0.1:3000',
      token: 'hagt_test_secret',
      fetchImpl: vi.fn(),
      sessionId: 'session',
    });

    const response = await bridge.handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'test', version: '1' },
      },
    });

    expect(response).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'hermes-agent-gateway' },
      },
    });
  });

  it('maps scope-filtered Agent Gateway definitions to MCP tools', async () => {
    const fetchImpl = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => jsonResponse({
      tools: [{
        type: 'function',
        function: {
          name: 'show_stock_chart',
          description: 'Show attributable quote data',
          parameters: {
            type: 'object',
            properties: { ticker: { type: 'string' } },
            required: ['ticker'],
          },
        },
      }],
    }));
    const bridge = new HermesMcpBridge({
      baseUrl: 'http://127.0.0.1:3000',
      token: 'hagt_test_secret',
      fetchImpl: fetchImpl as typeof fetch,
      sessionId: 'session',
    });
    await bridge.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });

    const response = await bridge.handle({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });

    expect(response).toMatchObject({
      result: {
        tools: [{
          name: 'show_stock_chart',
          inputSchema: expect.objectContaining({ type: 'object' }),
          annotations: expect.objectContaining({ readOnlyHint: true }),
        }],
      },
    });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe('http://127.0.0.1:3000/api/agent/v1/tools');
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer hagt_test_secret',
    );
  });

  it('proxies calls with stable idempotency and structured MCP content', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        tools: [{
          type: 'function',
          function: {
            name: 'execute_backtest',
            parameters: { type: 'object', properties: {} },
          },
        }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        result: {
          toolName: 'execute_backtest',
          data: { jobId: 'job-1', status: 'queued' },
          evidence: [],
          warnings: [],
        },
      }));
    const bridge = new HermesMcpBridge({
      baseUrl: 'http://127.0.0.1:3000',
      token: 'hagt_test_secret',
      fetchImpl: fetchImpl as typeof fetch,
      sessionId: 'session',
    });
    await bridge.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });

    const response = await bridge.handle({
      jsonrpc: '2.0',
      id: 'call-7',
      method: 'tools/call',
      params: {
        name: 'execute_backtest',
        arguments: { strategyVersionId: 'version-1', ticker: 'AAPL' },
      },
    });

    expect(response).toMatchObject({
      result: {
        isError: false,
        structuredContent: {
          result: {
            data: { jobId: 'job-1' },
          },
        },
      },
    });
    const [url, init] = fetchImpl.mock.calls[1]!;
    expect(String(url)).toBe(
      'http://127.0.0.1:3000/api/agent/v1/tools/execute_backtest',
    );
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['Idempotency-Key']).toBe(
      'mcp:session:call-7:execute_backtest',
    );
  });

  it('returns gateway tool failures as MCP tool errors', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        tools: [{
          type: 'function',
          function: {
            name: 'start_paper_strategy',
            parameters: { type: 'object', properties: {} },
          },
        }],
      }))
      .mockResolvedValueOnce(jsonResponse({ error: 'outside allowlist' }, 403));
    const bridge = new HermesMcpBridge({
      baseUrl: 'http://127.0.0.1:3000',
      token: 'hagt_test_secret',
      fetchImpl: fetchImpl as typeof fetch,
      sessionId: 'session',
    });
    await bridge.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });

    const response = await bridge.handle({
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: {
        name: 'start_paper_strategy',
        arguments: { ticker: 'AAPL', strategyVersionId: 'version-1' },
      },
    });

    expect(response).toMatchObject({
      result: {
        isError: true,
        content: [{
          type: 'text',
          text: expect.stringContaining('outside allowlist'),
        }],
      },
    });
  });
});
