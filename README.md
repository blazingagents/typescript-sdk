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
- `createChatRelay` serves browser chat from your backend.
  `BlazingAgentsChat` drives it from any UI framework, and
  `useBlazingAgentsChat` from `@blazingagents/sdk/react` drives it from React,
  with history restore, steering, and rollback.

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

`signedInUser` stands for your own session lookup.

In the browser, `BlazingAgentsChat` runs the chat in any UI framework. It
keeps the Session ID in `localStorage`, restores the stored transcript after a
reload, steers the running Turn when you send while a reply streams, and rolls
back to the stored transcript on an error, Stop, or New Session. Render
`getSnapshot()` and read it again each time a `subscribe` listener runs. The
snapshot is a new object only when something in it changed. Call `start()`
once the component is in the page and `dispose()` when it leaves. In Vue:

```ts
import { BlazingAgentsChat } from "@blazingagents/sdk";
import { onMounted, onUnmounted, shallowRef } from "vue";

export function useChat(headers: Record<string, string>) {
  const chat = new BlazingAgentsChat({ headers });
  const snapshot = shallowRef(chat.getSnapshot());
  const unsubscribe = chat.subscribe(() => {
    snapshot.value = chat.getSnapshot();
  });
  onMounted(chat.start);
  onUnmounted(() => {
    unsubscribe();
    chat.dispose();
  });
  return { chat, snapshot };
}
```

In Angular, keep the snapshot in a signal and render `snapshot().messages`:

```ts
import { afterNextRender, Component, DestroyRef, inject, signal } from "@angular/core";
import { BlazingAgentsChat } from "@blazingagents/sdk";

@Component({ selector: "app-chat", templateUrl: "./chat.component.html" })
export class ChatComponent {
  readonly chat = new BlazingAgentsChat({ api: "/api/chat" });
  readonly snapshot = signal(this.chat.getSnapshot());

  constructor() {
    const unsubscribe = this.chat.subscribe(() =>
      this.snapshot.set(this.chat.getSnapshot())
    );
    afterNextRender(this.chat.start);
    inject(DestroyRef).onDestroy(() => {
      unsubscribe();
      this.chat.dispose();
    });
  }
}
```

In React, install the optional `react` peer and call `useBlazingAgentsChat`,
which runs one `BlazingAgentsChat` per component:

```console
npm install react
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

The chat posts to `/api/chat` unless you pass `api`. `send()` starts a Turn
when the chat is idle and steers the running Turn otherwise. It resolves
`true` once the message is stored, and `false` when an error, Stop, or New
Session rolled it back, so you can put the text back in the input. The
snapshot also holds `status`, `pendingIds`, `sessionId`, `canRegenerate`, and
`error`, and the chat has `stop()`, `regenerate()`, `newSession()`, and
`addToolApprovalResponse()`. To send a new token, call `setHeaders()`, pass
`headers` as a function that returns the current ones, or pass new `headers`
to the hook.

Every chat on an origin keeps its Session under the same `localStorage` key,
`blazing-agents-session`, unless you pass `storageKey`. An app with several
Agents, or with several End-users who sign in on the same browser, passes a
`storageKey` per Agent and End-user, such as `chat:${agentId}:${userId}`. When
the signed-in End-user changes, create a new chat: in React, remount the
component that calls the hook with `key={userId}`, since the hook reads
`storageKey` on the first render only.

`BlazingAgentsChatTransport` is the transport alone, for an AI SDK `Chat` that
you run yourself. A relay written in another language follows the
[browser relay contract](docs/relay-contract.md).

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
