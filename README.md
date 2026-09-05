<div align="center">
  <a href="https://docs.blazingagents.com">
    <img src="https://raw.githubusercontent.com/blazingagents/docs/main/public/brand/icon.svg" alt="Blazing Agents logo" width="96">
  </a>
  <h1>Blazing Agents TypeScript SDK</h1>
  <p>Build production agents with a typed TypeScript client for the Blazing Agents API.</p>
  <p>
    <a href="https://docs.blazingagents.com/sdk/typescript">Documentation</a> ·
    <a href="https://www.npmjs.com/package/@blazingagents/sdk">npm</a>
  </p>
</div>

The official resource-style client SDK for the Blazing Agents `/v1` API. It
requires Node.js 24 or newer.

## Features

- Typed clients for Agents, Workspaces, Skills, Providers, Prompts, Tasks,
  Sessions, Artifacts, usage, and Tenant settings.
- Stateful chat and stateless text or structured-object generation.
- Public Zod contracts for validating API requests and responses.
- Cursor pagination and binary transfers.
- Request correlation and a typed, forward-compatible error model.

## Installation

```console
npm install @blazingagents/sdk ai@7.0.84
```

`ai` is a peer dependency. The SDK re-exports its `UIMessage` type.

## Quick start

Create a Tenant API key in the Blazing Agents dashboard, then pass it to the
client or read it from your server environment.

```ts
import { BlazingAgents } from "@blazingagents/sdk";

const client = new BlazingAgents({ apiKey: "ba_..." });

const result = await client.completion({
  agentId: "ag_...",
  prompt: "Write a friendly welcome message.",
});

console.log(await result.text);
```

Keep API keys on the server. For browser chat applications, relay `chat()`
through your backend and use `BlazingAgentsChatTransport` with AI SDK
`useChat`.

## Documentation

Read the
[TypeScript SDK documentation](https://docs.blazingagents.com/sdk/typescript)
for authentication, resource guides, generation and streaming, React
integration, error handling, and the complete API reference.

## Development

```console
npm ci
npm run check
npm run test:consumer
```

## License

[MIT](LICENSE)

### Thinking level

Agent create/update accepts `thinkingLevel: "high"`, `"off"`, `"max"`, or
another nonempty string supported by the selected Model. Omission on creation
means Provider default; omission on update preserves the saved value, while
`thinkingLevel: null` clears it. Agent and Version responses include the
selection, and `restoreVersion` restores it through ordinary validation.
Use `client.providers.getThinkingLevels(providerId, model)` to read
`{ known, levels }`. Unknown capabilities permit custom values that can still
be rejected during execution. Levels control reasoning, not a token/cost cap.
