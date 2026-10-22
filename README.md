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

The official TypeScript SDK is a client for the Blazing Agents `/v1` API that
your backend uses to manage Agents and run them for your users. It requires
Node.js 24 or newer.

## Features

- A typed method for every `/v1` operation an API key can call: Agents,
  Skills, Sessions, Memories, Prompts, Tasks, Workspaces, Artifacts,
  Providers, MCP Connections, Chat Connections, usage, spending limits, Tenant
  settings, and merchant monetization.
- Chat streams in the AI SDK UI message stream format, with steering, Tool
  approvals, and backend functions that run in your process.
- Text and structured-object generation.
- End-user scoped clients through `forUser`.
- Cursor pagination, uploads, and downloads.
- Request IDs and typed errors.
- `BlazingAgentsChatTransport` and `createChatRelay` connect AI SDK `useChat`
  to your backend.

## Installation

```console
npm install @blazingagents/sdk ai@^7.0.84 zod@^4.5.4
```

`ai` and `zod` are required peer dependencies. The SDK re-exports AI SDK
message types and Zod schemas, so your app and the SDK share one copy of each.

## Quick start

Create a Full API key in the Blazing Agents dashboard and set
`BLAZING_AGENTS_API_KEY` in your server environment. The key acts for your
whole Tenant, so keep it on your backend and never send it to a browser.

```ts
import { BlazingAgents } from "@blazingagents/sdk";

const client = new BlazingAgents({
  apiKey: process.env.BLAZING_AGENTS_API_KEY!,
});

const result = await client.completion({
  agentId: "ag_...",
  prompt: "Write a friendly welcome message.",
});

console.log(await result.text);
```

Replace `ag_...` with an Agent ID from the dashboard.

For requests from your users, scope the client to the user ID that your
backend verified at sign-in, never to an ID from the request body. A scoped
client reaches only that End-user's Agents, Sessions, and Workspace. An
unscoped Agent shares one Workspace across all your users, so give each user
an Agent of their own:

```ts
export async function createAgentForUser(userId: string): Promise<string> {
  const agent = await client.forUser(userId).agents.create({
    name: "Assistant",
    providerId: "prv_...",
    model: "openai/gpt-6-luna",
  });
  return agent.id;
}

export async function chatAsUser(
  userId: string,
  agentId: string,
  text: string
): Promise<Response> {
  const chat = await client.forUser(userId).chat({
    agentId,
    message: {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", text }],
    },
  });
  return chat.toResponse();
}
```

Call `createAgentForUser` once per user and store the Agent ID with the user.
A scoped chat with an Agent created without the scope fails with `404`.
`chatAsUser` returns the chat as a streaming `Response`. To chat from the
browser with `useChat`, serve `createChatRelay` from your backend and use
`BlazingAgentsChatTransport`. The relay scopes each request to the user that
your `resolveContext` returns.

## Examples

The [examples repository](https://github.com/blazingagents/examples) has
complete TypeScript and Python apps built on the Blazing Agents SDKs.

## Documentation

Read the
[TypeScript SDK documentation](https://docs.blazingagents.com/sdk/typescript)
for client setup, End-user scoping, chat and generation, a guide to each
resource, and error handling.

## Development

```console
npm ci
npm run check
npm run test:consumer
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the changelog convention and how
to release.

## License

[MIT](LICENSE)
