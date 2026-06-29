const LATEST_PROTOCOL_VERSION = '2025-11-25';
const SUPPORTED_PROTOCOL_VERSIONS = new Set([
  LATEST_PROTOCOL_VERSION,
  '2025-06-18',
  '2025-03-26',
]);

type RequestId = string | number;

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: RequestId;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: RequestId | null;
  result?: Record<string, unknown>;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface GatewayTool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

interface BridgeOptions {
  baseUrl: string;
  token?: string;
  fetchImpl?: typeof fetch;
  sessionId?: string;
}

class ProtocolError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
  }
}

class GatewayError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function objectParams(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ProtocolError(-32602, 'Invalid params');
  }
  return value as Record<string, unknown>;
}

function safeBaseUrl(raw: string): URL {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('HERMES_AGENT_BASE_URL must use http or https');
  }
  url.search = '';
  url.hash = '';
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  return url;
}

function toolAnnotations(name: string) {
  const readOnly = /^(get|show|inspect)_/.test(name);
  return {
    readOnlyHint: readOnly,
    destructiveHint: false,
    idempotentHint: readOnly,
    openWorldHint: readOnly,
  };
}

export class HermesMcpBridge {
  private readonly baseUrl: URL;
  private readonly token?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sessionId: string;
  private initialized = false;
  private knownTools = new Set<string>();

  constructor(options: BridgeOptions) {
    this.baseUrl = safeBaseUrl(options.baseUrl);
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sessionId = options.sessionId
      ?? globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 12);
  }

  async handle(message: unknown): Promise<JsonRpcResponse | null> {
    if (
      !message
      || typeof message !== 'object'
      || Array.isArray(message)
      || (message as { jsonrpc?: unknown }).jsonrpc !== '2.0'
      || typeof (message as { method?: unknown }).method !== 'string'
    ) {
      return this.error(null, -32600, 'Invalid Request');
    }
    const request = message as JsonRpcRequest;
    const notification = request.id === undefined;
    try {
      const result = await this.dispatch(request);
      if (notification) return null;
      return { jsonrpc: '2.0', id: request.id!, result };
    } catch (error) {
      if (notification) return null;
      if (error instanceof ProtocolError) {
        return this.error(request.id!, error.code, error.message, error.data);
      }
      return this.error(
        request.id!,
        -32603,
        error instanceof Error ? error.message : 'Internal error',
      );
    }
  }

  private async dispatch(request: JsonRpcRequest): Promise<Record<string, unknown>> {
    switch (request.method) {
      case 'initialize': {
        const params = objectParams(request.params);
        const requested = typeof params.protocolVersion === 'string'
          ? params.protocolVersion
          : LATEST_PROTOCOL_VERSION;
        const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.has(requested)
          ? requested
          : LATEST_PROTOCOL_VERSION;
        this.initialized = true;
        return {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: {
            name: 'hermes-agent-gateway',
            title: 'Hermes AI Trading Terminal',
            version: '1.0.0',
          },
          instructions: [
            'Tools proxy the authenticated Hermes Agent Gateway.',
            'Trading tools are invariantly paper-only and preserve token allowlists.',
            'Create immutable strategy versions and validate them before backtest or paper use.',
          ].join(' '),
        };
      }
      case 'notifications/initialized':
      case 'notifications/cancelled':
        return {};
      case 'ping':
        return {};
      case 'tools/list':
        this.requireInitialized();
        return { tools: await this.listTools() };
      case 'tools/call':
        this.requireInitialized();
        return this.callTool(objectParams(request.params), request.id);
      default:
        throw new ProtocolError(-32601, 'Method not found');
    }
  }

  private requireInitialized(): void {
    if (!this.initialized) {
      throw new ProtocolError(-32002, 'Server is not initialized');
    }
  }

  private requireToken(): string {
    if (!this.token?.trim()) {
      throw new ProtocolError(
        -32603,
        'HERMES_AGENT_TOKEN is required for Agent Gateway tools',
      );
    }
    return this.token.trim();
  }

  private async listTools() {
    const payload = await this.gatewayRequest('/api/agent/v1/tools');
    const rawTools = Array.isArray(payload.tools) ? payload.tools as GatewayTool[] : [];
    const tools = rawTools.map((entry) => {
      if (entry?.type !== 'function' || !entry.function?.name) {
        throw new ProtocolError(-32603, 'Agent Gateway returned an invalid tool definition');
      }
      return {
        name: entry.function.name,
        description: entry.function.description ?? '',
        inputSchema: entry.function.parameters ?? { type: 'object', properties: {} },
        annotations: toolAnnotations(entry.function.name),
      };
    });
    this.knownTools = new Set(tools.map((tool) => tool.name));
    return tools;
  }

  private async callTool(
    params: Record<string, unknown>,
    requestId: RequestId | undefined,
  ): Promise<Record<string, unknown>> {
    const name = typeof params.name === 'string' ? params.name : '';
    if (!name) throw new ProtocolError(-32602, 'Tool name is required');
    if (!this.knownTools.has(name)) await this.listTools();
    if (!this.knownTools.has(name)) {
      throw new ProtocolError(-32602, `Unknown tool: ${name}`);
    }
    const args = objectParams(params.arguments);
    try {
      const payload = await this.gatewayRequest(
        `/api/agent/v1/tools/${encodeURIComponent(name)}`,
        {
          method: 'POST',
          body: JSON.stringify(args),
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': this.idempotencyKey(requestId, name),
          },
        },
      );
      return {
        content: [{ type: 'text', text: JSON.stringify(payload) }],
        structuredContent: payload,
        isError: false,
      };
    } catch (error) {
      if (!(error instanceof GatewayError)) throw error;
      return {
        content: [{
          type: 'text',
          text: `Hermes Agent Gateway rejected ${name} (${error.status}): ${error.message}`,
        }],
        isError: true,
      };
    }
  }

  private idempotencyKey(requestId: RequestId | undefined, name: string): string {
    const stableId = String(requestId ?? 'notification').replace(/[^A-Za-z0-9._:-]/g, '_');
    const stableName = name.replace(/[^A-Za-z0-9._:-]/g, '_');
    return `mcp:${this.sessionId}:${stableId}:${stableName}`.slice(0, 128);
  }

  private async gatewayRequest(
    path: string,
    init: RequestInit = {},
  ): Promise<Record<string, unknown>> {
    const token = this.requireToken();
    const url = new URL(path.replace(/^\/+/, ''), this.baseUrl);
    const response = await this.fetchImpl(url, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    let payload: unknown = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new GatewayError(response.status, 'Gateway returned malformed JSON');
    }
    if (!response.ok) {
      const message = (
        payload
        && typeof payload === 'object'
        && typeof (payload as { error?: unknown }).error === 'string'
      )
        ? (payload as { error: string }).error
        : response.statusText || 'Request failed';
      throw new GatewayError(response.status, message);
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new GatewayError(response.status, 'Gateway returned an invalid response');
    }
    return payload as Record<string, unknown>;
  }

  private error(
    id: RequestId | null,
    code: number,
    message: string,
    data?: unknown,
  ): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
        ...(data === undefined ? {} : { data }),
      },
    };
  }
}

export const MCP_PROTOCOL_VERSION = LATEST_PROTOCOL_VERSION;
