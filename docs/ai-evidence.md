# AI Evidence and Citation Contract

Hermes separates user/persona/memory context from externally sourced evidence. Memory
can guide tone and preferences, but it cannot substantiate a market fact.

## Evidence items

Fact-bearing tools return one or more evidence items:

```json
{
  "id": "E1",
  "title": "AAPL quote",
  "content": "{\"price\":200}",
  "source": {
    "providerId": "yahoo",
    "providerVersion": "1",
    "retrievedAt": "2026-01-02T00:00:01.000Z",
    "marketTimestamp": "2026-01-02T00:00:00.000Z",
    "delayed": false
  }
}
```

Successful fact-bearing results without evidence are invalid. If no attributable data
exists, the tool returns `dataUnavailable` and no fabricated value.

## Model gateway

The model receives evidence rendered as stable `[E1]`, `[E2]` blocks with provider,
version, retrieval time, market time, and delay state. It must return strict structured
JSON:

```json
{
  "answer": "AAPL 的價格是 200。[E1]",
  "citations": [
    { "evidenceId": "E1", "claim": "AAPL price is 200" }
  ]
}
```

Hermes rejects:

- citation IDs absent from the supplied bundle;
- citation records whose `[E#]` marker is absent from the answer;
- evidence-backed answers with no citations;
- fabricated citations when provider data is unavailable;
- malformed model output.

Credentials are redacted before model calls and audit persistence.

## Prompt versions

Prompts are registered by immutable ID/version and SHA-256 template hash. Grounded chat
currently reports:

```text
agent.research.system@1.0.0
```

Responses include the prompt version, model, structured citations, and extracted
preference memories. Model/provider changes therefore remain distinguishable from data
or strategy changes.

## Browser chat and tools

When browser chat includes a symbol, Hermes resolves quote/chart, symbol-news, and SEC
fundamental tools concurrently. Each tool owns its provider lookup and may degrade
independently. The chat service combines every successful evidence item in deterministic
tool order and rebases tool-local IDs into one collision-free `[E1]`, `[E2]`, ... bundle.
If one provider fails, the remaining attributable sources can still support an answer;
if all sources fail, the gateway receives explicit `dataUnavailable` context.

The former no-op dynamic import of `server.ts` is removed. Tool schemas shown to the model
and server-side tool execution now come from the same registry.

The registry currently covers quote/chart context, symbol news, SEC fundamentals, FRED
macro series, data-source health, portfolio state, strategy drafts/validation, real
asynchronous backtests, and backtest inspection.
