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

The official resource-style client SDK for the Blazing Agents `/v1` API.

## Features

- Typed resource clients for Agents, Workspaces, Skills, Providers, Prompts,
  Tasks, Sessions, Artifacts, usage, and Tenant settings.
- Stateful chat streams and stateless text or structured-object generation.
- Public Zod contracts for validating API requests and responses.
- Cursor pagination, binary uploads and downloads, and request correlation.
- A single typed error model with forward-compatible server error codes.

## Installation

```bash
npm install @blazingagents/sdk ai@7.0.84
```

## Documentation

Read the
[TypeScript SDK documentation](https://docs.blazingagents.com/sdk/typescript)
for guides and the complete API reference.

`ai` is a peer dependency (`^7`). The SDK re-exports `UIMessage` from `ai` —
it never redeclares it.

## Runtime contracts

Import the public Zod schemas from the explicit contracts entry point:

```ts
import {
  agentIdSchema,
  createAgentBodySchema,
} from "@blazingagents/sdk/contracts";

const agentId = agentIdSchema.parse("ag_0123456789abcdef");
const input = createAgentBodySchema.parse({ name: "Support agent" });
```

The contracts entry point contains public HTTP request and response schemas.
Platform-only persistence and service contracts are not part of the SDK.

## Quick start

```ts
import { BlazingAgents } from "@blazingagents/sdk";

const client = new BlazingAgents({
  apiKey: "ba_your_api_key",
  // baseUrl defaults to https://api.blazingagents.com.
  onResponse(response) {
    // Store response.requestId with your logs for support correlation.
    console.log(response.requestId, response.status);
  },
});

// --- Management ---

// Agents
const agent = await client.agents.create({
  name: "My Agent",
  model: "openrouter/auto",
  instructions: "Be helpful.",
  tools: ["write_todos"],
});
// Every Agent receives a Workspace. Its runtime stays lazy until first use.
const defaultWorkspace = await client.workspaces.get({
  workspaceId: agent.workspaceId,
});

const list = await client.agents.list();
const fetched = await client.agents.get(agent.id);
const updated = await client.agents.update(agent.id, { name: "Renamed" });

// Pass an existing Workspace to share it, or switch to one later.
const sharedWorkspace = await client.workspaces.create({ name: "Team files" });
const teammate = await client.agents.create({
  name: "Teammate",
  model: "openrouter/auto",
  workspaceId: sharedWorkspace.id,
});
await client.agents.update(agent.id, { workspaceId: sharedWorkspace.id });

// Agent-owned Skills
const skills = client.agent(teammate.id).skills;
const skill = await skills.create({
  path: "SKILL.md",
  content: "---\nname: release-notes\ndescription: Draft release notes.\n---\n",
});
await skills.putFile({
  skillId: skill.id,
  path: "references/style.md",
  content: "Use sentence case.",
});

// Deleting an Agent preserves its Workspace for explicit cleanup or reuse.
await client.agents.delete(agent.id, false);
await client.workspaces.get({ workspaceId: sharedWorkspace.id });

// Prompts
const prompt = await client.prompts.create({
  name: "Greeting",
  template: "Hello {{name}}!",
});
const promptList = await client.prompts.list();

// Providers
const provider = await client.providers.create({
  name: "My OpenRouter",
  providerType: "openrouter",
  apiKey: "sk-or-...",
});

// Tenant settings
const settings = await client.tenant.get();
await client.tenant.patch({
  quota: { monthlyTokenLimit: 100_000, monthlyRequestLimit: null, resetDay: 1 },
});

// Usage
const usage = await client.usage.get({ groupBy: "agent" });
const agentUsage = await client.usage.getForAgent(agent.id);

// Tasks
const task = await client.tasks.create({
  agentId: agent.id,
  name: "Daily Report",
  prompt: "Generate the daily report",
});
const run = await client.tasks.createRun(task.task.id);

// Persist task.task.id and run.runId, then return to the caller.

// In a later request, scheduled job, or worker invocation:
const outcome = await client.tasks.getRun(task.task.id, run.runId);
if (outcome.status !== "queued" && outcome.status !== "running") {
  const transcript = await client.tasks.runMessages(task.task.id, run.runId);
}

// Sessions
const sessions = await client.sessions.list(agent.id);
const messages = await client.sessions.messages(agent.id, sessionId);

// Artifacts
const artifacts = await client.artifacts.list({ agentId: agent.id });
const artifact = artifacts.data[0];
if (artifact) {
  const { url } = await client.artifacts.createDownloadUrl(artifact.artifactId);
  const bytes = await (await fetch(url)).arrayBuffer();
}
```

Generation request inputs accept `clientRequestId` for caller-owned
correlation without raw headers. For any resource or generation request, use
`client.withOptions({ clientRequestId })` to create a scoped client view. The
callback receives the method, path
without query, status, duration, server `requestId`, and the same optional
`clientRequestId` once for every received response, including errors and
streaming handshakes. Callback failures are ignored and transport failures
with no response do not invoke it. The server-owned `requestId` identifies one
HTTP attempt and should be retained when contacting support.
Successful generated message metadata separately exposes `usage.turnId` for
the admitted, metered Turn. It is not the HTTP `requestId` or message ID.

## Generation methods

### `client.chat(input)` — stateful UI message stream

The server mints the `ss_` session id. Start a new chat with a single
`client.chat({ agentId, message })` call — no `sessionId`, no `mode` —
and read the minted id from `await result.sessionId` (resolved from the
create response's `Location` header):

```ts
// Create — the server mints the ss_ id and returns it via Location.
const created = await client.chat({
  agentId: agent.id,
  message: {
    id: "msg_user_1",
    role: "user",
    parts: [{ type: "text", text: "Hello!" }],
  },
});
const sessionId = await created.sessionId;
return created.toResponse();
```

`toResponse()` exposes the server's AI SDK UI-message SSE response unchanged
for relay to the browser. It is one-shot; a repeated call throws a
`BlazingAgentsError` with `code: "stream_error"`. `result.sessionId` remains
independently awaitable before or after selecting the response.

After `useChat` successfully consumes that response, pass the same `sessionId`
on a later request to continue the chat:

```ts
const result = await client.chat({
  agentId: agent.id,
  sessionId,
  message: {
    id: "msg_user_2",
    role: "user",
    parts: [{ type: "text", text: "Follow up" }],
  },
});

return result.toResponse();
```

`trigger: "regenerate-message"` is valid only when `sessionId` is present.
`messageId` remains optional when regenerating an existing Session.

Prompt-invocation variant (server resolves + renders the template):

```ts
const result = await client.chat({
  agentId: agent.id,
  promptId: "prompt_...",
  variables: { name: "Alice" },
});
```

### `client.completion(input)` — stateless text stream

`POST /v1/agents/:agentId/generation` with text output. Returns a text-stream result:

```ts
const result = await client.completion({
  agentId: agent.id,
  prompt: "Write a haiku about the sea.",
});

for await (const delta of result.textStream) {
  process.stdout.write(delta);
}

const fullText = await result.text;
```

### `client.object(input)` — stateless structured output

`POST /v1/agents/:agentId/generation` with structured output. Returns a partial-object stream:

```ts
const result = await client.object({
  agentId: agent.id,
  prompt: "Give me a person",
  schema: {
    type: "object",
    properties: {
      name: { type: "string" },
      age: { type: "number" },
    },
    required: ["name"],
  },
});

for await (const partial of result.partialObjectStream) {
  console.log(partial);
}

const finalObject = await result.object;
```

## React `useChat` transport

Keep `BlazingAgents` and its API key on your backend. The browser-safe
`BlazingAgentsChatTransport` sends the latest user message, forwards
regeneration metadata, captures the Session ID from the first response's
`Location` header, and includes that ID on later sends.

### Tenant backend

```ts
import {
  BlazingAgents,
  createChatRelay,
  createCompletionRelay,
} from "@blazingagents/sdk";

const client = new BlazingAgents({ apiKey: process.env.BLAZING_AGENTS_API_KEY });

const resolveContext = async (request: Request) => {
  const user = await authenticateApplicationRequest(request);
  return user ? { agentId: "ag_...", userId: user.id } : null;
};

export const POST = createChatRelay({
  client,
  resolveContext,
  sessions: {
    ownerOf: (sessionId) => chatSessions.ownerOf(sessionId),
    recordOwner: (sessionId, userId) =>
      chatSessions.recordOwner(sessionId, userId),
  },
});

export const POST_COMPLETION = createCompletionRelay({ client, resolveContext });
```

Both factories accept standard Web `Request` objects and return standard Web
`Response` objects. They validate AI SDK input, ignore browser attempts to set
reserved agent/attribution fields, authorize Session resumes, record ownership
before returning a created stream, preserve safe status and correlation
headers, and propagate request cancellation. Framework adapters only need to
pass their request to the returned function.

### Browser

```tsx
import { useChat } from "@ai-sdk/react";
import { BlazingAgentsChatTransport } from "@blazingagents/sdk";
import { useState } from "react";

function useBlazingChat({
  initialSessionId,
  rememberSessionId,
}: {
  initialSessionId?: string;
  rememberSessionId: (sessionId: string) => void;
}) {
  const [transport] = useState(
    () =>
      new BlazingAgentsChatTransport({
        api: "/api/chat",
        onSessionId: rememberSessionId,
        sessionId: initialSessionId,
      }),
  );
  return useChat({ transport });
}
```

The backend should derive `userId` from its authenticated session, never from
an untrusted browser field. The Session store is a durable server-owned mapping;
the opaque browser `sessionId` and End-user Attribution are not authorization.
Use one stable transport instance per chat. Persist the ID received by
`onSessionId`, and restore it through `sessionId` only after the backend has
authorized that Session for the current application user.

## Error model

All SDK failures use `BlazingAgentsError`. The server's lower-snake-case code
is preserved exactly, including a future code unknown to the installed SDK.
`KnownBlazingAgentsErrorCode` provides editor completion for the current API
catalog and four SDK-local codes:

| Local code | Meaning |
| --- | --- |
| `invalid_response` | A response is not a valid API envelope or successful JSON result. |
| `network_error` | Fetch failed before an HTTP exchange for a reason other than caller abort. |
| `request_aborted` | The caller's `AbortSignal` aborted the request. |
| `stream_error` | A stream failed after its response started or violated its stream contract. |

`BlazingAgentsError` exposes `code`, `message`, and optional `status`,
`details`, `param`, `headers`, `requestId`, `responseBody`,
`responseBodyTruncated`, and `cause`. A malformed response uses the stable
`invalid_response` message and retains a size-bounded body separately.
Response-backed failures copy `X-Request-Id` into `requestId`.

```ts
import { BlazingAgentsError } from "@blazingagents/sdk";

try {
  await client.agents.get("ag_nonexistent...");
} catch (error) {
  if (BlazingAgentsError.isInstance(error)) {
    console.log(error.code);
    console.log(error.status);
    console.log(error.requestId);
    console.log(error.message);
  }
}
```

Use `BlazingAgentsError.isInstance()` instead of `instanceof` when package
copies may cross realms or bundlers. See the public
[error catalog and stream boundary](https://docs.blazingagents.com/api-reference/protocols/errors).

## Development

Install dependencies and run the complete standalone check:

```bash
npm ci
npm run check
npm run test:consumer
```
