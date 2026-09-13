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
  Sessions, Artifacts, Slack and Telegram Chat Connections, usage, and Tenant settings.
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
Use `client.providers.getThinkingLevels({ providerId, model })` to read
`{ known, levels }`. Unknown capabilities permit custom values that can still
be rejected during execution. Levels control reasoning, not a token/cost cap.

For native clients whose `Response` constructor does not support streaming bodies,
use `result.toStream()` on chat or terminal continuation results to read the
original SSE bytes. It shares one-shot ownership with `toResponse()`; choose one
accessor per result. Stream errors and cancellation retain the same behavior.

### Direct native chat

For a direct SDK integration, use `BlazingAgentsDirectChatTransport` with AI SDK
`useChat`. It sends through `client.chat()` and uses AI SDK's stream decoder
without constructing a streaming `Response`. Inject your native streaming fetch
implementation into `BlazingAgents` when the runtime requires one.

```tsx
import { useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { BlazingAgentsDirectChatTransport } from "@blazingagents/sdk";

function Chat({ client, agentId, initialSessionId, saveSessionId }) {
  const transport = useMemo(
    () => new BlazingAgentsDirectChatTransport({
      client,
      agentId,
      sessionId: initialSessionId,
      onSessionId: saveSessionId,
    }),
    [client, agentId, initialSessionId, saveSessionId],
  );
  const chat = useChat({ transport });
  // Render chat.messages and submit using chat.sendMessage({ text }).
}
```

Install `@ai-sdk/react` for the React hook. Keep the transport stable for one chat;
remount the chat with a new transport when switching credentials, Agents, or
Sessions. `onSessionId` runs once for a newly created Session before stream
consumption, so it can be saved even if streaming later fails. The adapter
preserves user message IDs, regeneration targets, and `useChat` cancellation.
Regeneration requires an existing Session. Reconnection returns `null`; the
adapter does not retry interrupted Turns or resume their streams.

### Cancel requests

Pass an optional `abortSignal` in the request object for reads, writes, uploads,
and generation:

```ts
const controller = new AbortController();
const agents = client.agents.list({ abortSignal: controller.signal });
controller.abort();
await agents; // Rejects with the SDK's typed cancellation error.
```

SDK response parsing strips unknown object fields while validating required
fields and known field types. Request validation remains strict.

### Migrating from 0.2.x to 0.3.0

Resource and generation methods take a single request object, optional when no
fields are required. Move positional identifiers, body fields, and request
options into that object. Use `abortSignal` instead of
`signal`; custom fetch implementations still receive the native `signal`.

```ts
// Before (0.2.x)
client.agents.update(agentId, { name: "Builder" });
client.sessions.messages(agentId, sessionId, { signal });
client.agent(agentId).skills.list();

// After (0.3.0)
client.agents.update({ agentId, name: "Builder", abortSignal: signal });
client.sessions.messages({ agentId, sessionId, abortSignal: signal });
client.agent({ agentId }).skills.list({ abortSignal: signal });
```

`ResourceRequestOptions` replaces `ResourceReadOptions`. Cancellation stops the
request; it does not roll back a mutation already accepted by the server.

## Interactive resend

Successful interactive exchanges are saved together. Failed or canceled execution
leaves saved history unchanged, including the previous answer during regeneration;
executed usage and Tool effects remain. Retain submitted text/images until success
and resend edited or unchanged input through ordinary chat with a fresh message ID.
Stop requests cancellation; a lost response can hide a saved exchange. Reuse the
returned Session ID and load history normally on return. No outcome polling or
automatic generation retry is needed. See the [chatbot guide](https://docs.blazingagents.com/getting-started/chatbot)
and [working examples](https://github.com/blazingagents/examples).

## Automatic context compaction

Agents enable automatic compaction by default with a 16,384-token reserve.
A larger reserve compacts earlier. Settings are included in Agent Versions.
Compaction summarizes older history for the model while retaining the full
Session transcript; summarization calls contribute to token usage.

```ts
await client.agents.update({
  agentId: "ag_...",
  autoCompaction: true,
  compactionReserveTokens: 32768,
});
```

### Tool approval policies (0.8.0)

Agents and immutable Agent Versions expose separate `approvalInChat` and
`approvalInTasks` policies. Create and update them through the ordinary Agent API:

```ts
await client.agents.update({
  agentId,
  approvalInChat: {
    default: "full",
    overrides: [
      { tool: { type: "builtin", name: "bash" }, decision: "manual" },
      {
        tool: { type: "mcp", connectionId: "mcp_0123456789abcdef", name: "send_mail" },
        decision: "auto",
      },
    ],
  },
  approvalInTasks: { default: "deny", overrides: [] },
});
```

An exact tool override wins over the default. Both policies default to `full`
with no overrides. `full` allows available tools, `deny` blocks execution,
`manual` requires human review, and `auto` uses backend LLM review. Review errors
block execution; escalation without an available human also blocks execution.
Policies do not grant tool access. MCP references use the original remote tool
name and connection ID; the backend validates attachment and discovery.

Omitting a policy from an update preserves it. Supplying one replaces that whole
policy; omitted or empty `overrides` clears its overrides. `restoreVersion`
restores both policies alongside the other versioned fields.

Interactive Sessions reuse `client.sessions.toolApprovals`,
`client.sessions.decideToolApproval`, and
`client.sessions.joinToolApprovalContinuation`. A configured backend human
reviewer path is required. Tasks and stateless generations have no human
continuation path and block manual or escalated calls; stateless generation uses
`approvalInChat`. The SDK does not run an approval reviewer.

Approval rows retain optional `tool`, `assistantMessageId`, `createdAt`, and
`decidedAt` metadata. `tool` and `decidedAt` may be null (admin tools have no
ordinary-policy reference). Persisted approval decisions remain
`pending | approved | denied`; policy modes are `full | deny | manual | auto`.
The root package exports `ApprovalDecision`, `ApprovalPolicy`, `ToolReference`,
and `ToolApprovalState`; runtime policy schemas are exported from
`@blazingagents/sdk/contracts`.

## Slack and Telegram

Use the [connection example](https://github.com/blazingagents/typescript-sdk/blob/main/examples/chat-integrations.md) to connect an existing
Agent through REST. BA hosts the Chat SDK runtime, conversation history, and
approval cards; no additional SDK resource is required.
