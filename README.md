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
- `createChatRelay` serves browser chat from your backend, and
  `useBlazingAgentsChat` from `@blazingagents/sdk/react` drives it from React:
  history restore, steering, and rollback included.

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
`chatAsUser` returns the chat as a streaming `Response`.

## Chat from a browser

The browser holds no API key, so it chats through your backend. Serve
`createChatRelay` on one route. It answers chat, history, and steer requests
as the End-user that your `resolveContext` returns:

```ts
import { createChatRelay } from "@blazingagents/sdk";

export const relayChat = createChatRelay({
  client,
  resolveContext: async (request) => {
    const user = await signedInUser(request);
    return user ? { agentId: user.agentId, userId: user.id } : null;
  },
});

app.post("/api/chat", (c) => relayChat(c.req.raw));
```

`signedInUser` stands for your own session lookup. In React, install the
optional peers and call `useBlazingAgentsChat`:

```console
npm install react @ai-sdk/react
```

```tsx
import { useBlazingAgentsChat } from "@blazingagents/sdk/react";
import { useState } from "react";

export function Chat({ token }: { token: string }) {
  const [text, setText] = useState("");
  const chat = useBlazingAgentsChat({
    headers: { authorization: `Bearer ${token}` },
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        chat.send(text);
        setText("");
      }}
    >
      {chat.messages.map((message) => (
        <p key={message.id}>
          {message.role}:{" "}
          {message.parts.map((part) => (part.type === "text" ? part.text : ""))}
        </p>
      ))}
      <input value={text} onChange={(event) => setText(event.target.value)} />
    </form>
  );
}
```

The hook posts to `/api/chat` unless you pass `api`. It keeps the Session ID
in `localStorage` and restores the stored transcript after a reload. `send()`
starts a Turn when the chat is idle and steers the running Turn otherwise. It
resolves `true` once the message is stored, and `false` when an error, Stop,
or New Session rolled it back, so you can put the text back in the input. The
hook also returns `status`, `stop()`, `regenerate()`, `newSession()`,
`addToolApprovalResponse()`, `pendingIds`, and `error`.

`BlazingAgentsChatTransport` is the same browser side without React, for an
AI SDK `Chat` in another framework. A relay written in another language
follows the [browser relay contract](docs/relay-contract.md).

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
