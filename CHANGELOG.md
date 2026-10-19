# Changelog

## 0.35.0

### Changed

- Every method that puts an ID in the URL path now throws `BlazingAgentsError` with code `invalid_request` before any request when that ID is `""`, `.` or `..`. Before, `.` and `..` reached `fetch` unencoded, and URL normalization sent the request to a parent path: `agents.disable({ agentId: ".." })` called `/v1/disable`.
- `forUser(userId)` throws `BlazingAgentsError` with code `invalid_request` and `param: "userId"` for an invalid user ID, instead of a `ZodError`.
- `new BlazingAgentsChatTransport({ sessionId })` and `new BlazingAgentsDirectChatTransport({ sessionId })` throw `BlazingAgentsError` with code `invalid_request` and `param: "sessionId"` for a malformed Session ID, instead of a `ZodError`.
- `sessions.submitInput`, `sessions.inputs`, `sessions.stop`, `mcpConnections.update`, `mcpConnections.reconnect` and `usage.sessions` no longer validate IDs or the request body locally, and so no longer throw `ZodError`. The server validates them and answers `invalid_request`, which the SDK throws as `BlazingAgentsError`. Catch `BlazingAgentsError` in place of `ZodError`:

```ts
// Before
try {
  await client.sessions.stop({ agentId, sessionId, turnId });
} catch (error) {
  if (error instanceof ZodError) showInvalidId();
}

// After
try {
  await client.sessions.stop({ agentId, sessionId, turnId });
} catch (error) {
  if (BlazingAgentsError.isInstance(error) && error.code === "invalid_request") {
    showInvalidId();
  }
}
```

### Added

- Every request schema in `@blazingagents/sdk/contracts` carries the field descriptions of the API reference, so `z.toJSONSchema(createAgentBodySchema)` and editor hovers on a parsed body describe each field. The server generates its OpenAPI document from these same schemas, so the SDK and the API reference cannot drift apart.
- `BlazingAgentsChatMessageMetadata.blazingAgents.compactedContext`: when a turn compacted the conversation, the assistant message's metadata carries the AI SDK `ModelMessage[]` the next turn resumes from.

### Fixed

- `jsonSchemaShapeSchema` accepts a schema whose root `$ref` names a `$defs` entry containing `/` or `~`, escaped as `~1` and `~0` the way JSON Pointer requires. Before, such a schema was rejected as having no schema root.

### Removed

- `tenantSchema`, `tenantResponseSchema` and `subscriptionStatusSchema` from `@blazingagents/sdk/contracts`. They described `GET /v1/me`, which accepts only a dashboard session and refuses every API key, so no SDK method ever returned that shape. There is no replacement: read your tenant's settings with `client.tenant.getSettings()` (`tenantSettingsResponseSchema`).

## 0.34.0

### Changed

- A Turn stream that fails after it starts now names its error in one transient `data-ba-error` event before the `error` chunk. Its `data` has the shape of an HTTP error body's `error`: `code`, `message` and optional `details`. `code` is an `ApiErrorCode` or `turn_interrupted`, which only a stream sends, and stays open to codes added later, as an HTTP error code does. `turnStreamErrorEventSchema` and `TurnStreamErrorEvent` describe it, and `BlazingAgentsUIMessage` types it as the `ba-error` data part.

### Removed

- `spendingLimitStopEventSchema`, `SpendingLimitStopEvent`, `turnInterruptedEventSchema` and `TurnInterruptedEvent`, with the `data-model-spending-limit` and `data-turn-interrupted` events they described. A spending stop now arrives as `data-ba-error` with code `model_spending_limit_exceeded`, and its numbers move to `details`:

```ts
// Before
onData: (chunk) => {
  if (chunk.type === "data-model-spending-limit") {
    showSpendingStop(chunk.data);
  }
  if (chunk.type === "data-turn-interrupted") {
    reloadMessages();
  }
};

// After
onData: (chunk) => {
  if (chunk.type !== "data-ba-error") {
    return;
  }
  if (chunk.data.code === "model_spending_limit_exceeded") {
    showSpendingStop(spendingLimitStopDetailsSchema.parse(chunk.data.details));
  }
  if (chunk.data.code === "turn_interrupted") {
    reloadMessages();
  }
};
```

## 0.33.0

### Removed

- `mcpConnections.connect()`, with its `McpConnectionOauthConnectResponse` type and the `mcpConnectionOauthConnectResponseSchema` export from `@blazingagents/sdk/contracts`. The API serves that route only to a dashboard session and refuses an API key, so the method always failed. Finish OAuth sign-in for an `oauth_authorization_code` connection from the dashboard. To replace a connection's URL or credentials from code, call `reconnect()`:

```ts
// Before (always refused)
await client.mcpConnections.connect({ mcpConnectionId });

// After
await client.mcpConnections.reconnect({
  mcpConnectionId,
  authType: "bearer",
  url: "https://mcp.example.com/mcp",
  bearerToken,
});
```

## 0.32.0

### Added

- `chatConnections.listDeliveries()` lists one page of a Chat Connection's deliveries in every status, newest first. Pass `nextCursor` as `cursor` to fetch older records.
- `chatConnections.repairDelivery()` sends a stuck reply or approval card again without running a turn. Pass the delivery's current `attempt` as `expectedAttempt`, and set `previousSenderStopped` and `acceptDuplicateRisk` to `true`. The message can appear twice, so check `status` in the result.

### Fixed

- Every method encodes the IDs it puts into a request path. Before, an ID with `/`, `?`, `#` or `..` could leave its path segment and reach a different endpoint.
- `agent(...).skills.putFile()` sends its content as `application/octet-stream`, as the API contract requires.

## 0.31.0

### Removed

- `forUser(...).agents.getSpendingLimit()` and `forUser(...).agents.updateSpendingLimit()`, deprecated in 0.30.0. The API always refused them for user-scoped callers. `UserAgentsResource` no longer has them. Call them on the tenant client:

```ts
// Before
await client.forUser(userId).agents.getSpendingLimit({ agentId });

// After
await client.agents.getSpendingLimit({ agentId });
```

## 0.30.0

### Added

- `forUser(...).usage.getForAgent()` reads one Agent's usage for the scoped user. The API already allowed it.

### Deprecated

- `forUser(...).agents.getSpendingLimit()` and `forUser(...).agents.updateSpendingLimit()`. The API always refuses them for user-scoped callers with `forbidden` (403), so they never worked there. They are removed from user-scoped clients in a later release. Call them on the tenant client:

```ts
// Before
await client.forUser(userId).agents.getSpendingLimit({ agentId });

// After
await client.agents.getSpendingLimit({ agentId });
```

## 0.29.0

### Removed

- `AgentToolDefinition.category`, `AGENT_TOOL_CATEGORIES`, and `AgentToolCategoryId`, deprecated in 0.28.0. Group tools by their first tag and `AGENT_TOOL_GROUPS`:

```ts
// Before
AGENT_TOOL_CATEGORIES.map((category) => ({
  ...category,
  tools: AGENT_TOOLS.filter((tool) => tool.category === category.id),
}));

// After
AGENT_TOOL_GROUPS.map((group) => ({
  ...group,
  tools: AGENT_TOOLS.filter((tool) => tool.tags[0] === group.tag),
}));
```

## 0.28.1

### Fixed

- `tool.tags.includes("file_read")` typechecks. `AgentToolTags` is now `readonly [AgentToolGroupTag, ...AgentToolFileAccessTag[]]`, and `AGENT_TOOLS` has that declared type instead of one literal tuple per tool.

## 0.28.0

### Added

- Every `AGENT_TOOLS` entry has `tags`. Its first tag is the tool's group (`files`, `planning`, `memory`, or `web`). A file operation tool also has one file access tag: `file_read`, `file_write`, or `execute`. An Agent whose file tools are all `file_read` cannot change Workspace files.
- `AGENT_TOOL_GROUPS` names and describes each group tag. `AGENT_TOOL_TAGS` lists every tag.

### Deprecated

- `AgentToolDefinition.category`, `AGENT_TOOL_CATEGORIES`, and `AgentToolCategoryId`. They are removed in a later release.

Group tools by their group tag instead of their category:

```ts
// Before
AGENT_TOOL_CATEGORIES.map((category) => ({
  ...category,
  tools: AGENT_TOOLS.filter((tool) => tool.category === category.id),
}));

// After
AGENT_TOOL_GROUPS.map((group) => ({
  ...group,
  tools: AGENT_TOOLS.filter((tool) => tool.tags[0] === group.tag),
}));
```
