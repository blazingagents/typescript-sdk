# Changelog

## Unreleased

### Added

- `web_fetch` joins the Agent tool catalog (`AGENT_TOOLS`, `AgentToolName`). It reads a public web page or text document by URL and returns markdown, and needs no Workspace. Like every tool it is off until you list it in `tools`, and a built-in approval policy can now name it. `"web_fetch"` is also a reserved `chatFunctionNameSchema` name, so a caller function can no longer use it. The `web` group description now reads "Search the public web and read pages by URL."

### Fixed

- `chat` with `functions` now rejects with `stream_error` when the API's response to a new chat has a missing or malformed `Location` header, and cancels the stream. It previously returned the stream unfiltered, so `createChatRelay` could forward `data-ba-function-call` events to the browser and the local handlers never ran. `createChatRelay` now answers 502 `stream_error` in that case. Chats without `functions` are unchanged: only `result.sessionId` rejects.

## 0.43.1

### Changed

- The `userId` description on memory creation now says a general memory is seen by unscoped turns only; a turn made through `forUser` sees only its end user's memories.

## 0.43.0

This release moves Session ownership from your backend to the API and removes `workflowIssue` from merchant usage events. The platform has no production users yet, so each removal ships in one release without a deprecation step.

### Changed

- `createChatRelay` and `createCompletionRelay` now run each request as the signed-in End-user through `client.forUser(context.userId)`. The API reaches only that End-user's Agents, Sessions and Workspaces, binds a new Session to that End-user, and answers 404 (`not_found` or `workspace_not_found`) for anything else. The relay no longer puts `userId` in the request body. Make sure `context.agentId` names an Agent that this End-user owns and whose Workspace the same End-user owns. An Admin Agent, or an Agent of another End-user, now answers 404.
- A Session that belongs to another End-user, or does not exist, now yields the API's 404 with its error code and request ID, instead of a local 403 `forbidden`.
- A `context.userId` that `forUser` rejects, such as one with leading or trailing spaces, answers 500 `internal_error` ("Request failed.") without the ID or the validation message, and sends nothing to the API. Fix the resolver that returned it.
- The `client` option must now provide `forUser`. A `BlazingAgents` client does.
- `merchantUsageEventNextAction()` takes `automaticDeliveryStopped: boolean` instead of `workflowIssue`. Pass `true` when automatic delivery has given up on a `pending` event; the result is then `retry`.
- The MCP connection `url` description now says `https`, which is the only scheme the API accepts.

### Removed

- `SessionOwnershipStore` and the `sessions` option of `createChatRelay`. The API now enforces which End-user owns each Session, so delete your ownership table and its reads and writes, and pass the same `BlazingAgents` client:

  ```ts
  // Before
  const relay = createChatRelay({
    client,
    sessions: { ownerOf, recordOwner },
    resolveContext,
  });
  // After
  const relay = createChatRelay({ client, resolveContext });
  ```

- `MerchantUsageEvent.workflowIssue` and `merchantWorkflowIssueSchema`. Read `nextAction` instead. It is `retry` for a `pending` event whose automatic delivery has stopped, which is when `workflowIssue` was set:

  ```ts
  // Before
  if (event.workflowIssue !== null) {
    await client.merchantUsageEvents.retry({ eventId: event.id });
  }
  // After
  if (event.nextAction === "retry") {
    await client.merchantUsageEvents.retry({ eventId: event.id });
  }
  ```

## 0.42.1

### Changed

- The vendored contract now matches the platform, which no longer sends the merchant connection `status`, the usage summary counts `uncertain` and `unmapped`, or the steer receipt states `delivered` and `uncertain`. The SDK stopped reading them in 0.42.0, so no code changes.

## 0.42.0

This release matches the platform contract. The platform has no production users yet, so each removal ships in one release without a deprecation step.

### Added

- `ErrorCode` includes `agent_busy`. `agents.delete()` fails with `agent_busy` (409) while the Agent has a live Turn or a queued or running Task run. Wait for that work to finish, then delete again.

### Changed

- `workspaces.delete()` resolves to `void`. The API now deletes the Workspace before it responds with 204, so the `"pending"` result can no longer occur. Drop any check of the result:

  ```ts
  // Before
  if ((await client.workspaces.delete({ workspaceId })) === "pending") {
    // …
  }
  // After
  await client.workspaces.delete({ workspaceId });
  ```

- A spending limit's `availableUsd` is now `max(0, amountUsd - spentUsd)`, because the platform no longer holds funds for running work. The `unpriced` stop reason now also covers a model response whose cost could not be determined; the Turn stops after that response.
- A Session input receipt `not_placed` now also covers a steer whose Turn read it and then failed or lost its owner (`reason: "owner_lost"`). Send it again as ordinary chat. A resend can repeat Tool effects, as any resend can.

### Removed

- Chat delivery listing and repair: `client.chatDeliveries.list()`, `client.chatConnections.listDeliveries()`, `client.chatConnections.repairDelivery()`, the `ChatDelivery`, `ChatDeliveryList`, `ChatDeliveryListStatus`, `ChatDeliveryResult`, `ChatDeliveryStatus`, `ChatDeliveriesResponse`, `TenantChatDelivery`, `RepairChatDeliveryBody`, `ChatDeliveriesResource` and `ChatDeliveriesListOptions` types, and their schemas in `@blazingagents/sdk/contracts`, including `chatDeliveryIdSchema`. The workflow that runs a Slack or Telegram Turn now posts the reply or approval card itself, at least once with a bounded retry, and a reply that still fails stays in the Session transcript. There is no replacement call; delete code that listed or repaired deliveries.
- `reservedUsd` from the spending-limit `period` and from the `model_spending_limit_exceeded` details, and the `reserved` and `unknown_usage` stop reasons. Stop reading `reservedUsd`; `reason` is now `exhausted` or `unpriced`.
- The `delivered` and `uncertain` Session input states. `SessionInputState` is now `accepted`, `committed` or `not_placed`. Treat code that handled `uncertain` as `not_placed`, and `delivered` as `accepted`.
- The merchant connection's `status` field, the `status` option of `merchantConnection.update()`, and `merchantConnectionStatusSchema`. A current connection is always active. To pause billing, turn monetization off with `client.tenant.patch({ monetizationEnabled: false })` instead of setting `status: "disconnected"`.
- The `uncertain` and `unmapped` merchant usage event statuses, the `bind_and_release` next action, the summary `counts.uncertain` and `counts.unmapped`, and `merchantUsageEvents.release()`. A delivery whose retries run out now ends `failed` with `lastErrorCode` `MERCHANT_RETRIES_EXHAUSTED`; call `merchantUsageEvents.retry()` on it, which is safe because the provider drops duplicates by the event ID. Usage of an End-user with no customer binding is recorded once as `discarded` with `lastErrorCode` `MERCHANT_CUSTOMER_UNMAPPED` and is never billed later. To bill an End-user, bind them with `merchantBindings.put()` before their first Turn, or turn on the guard so an unbound End-user's Turn fails with `merchant_customer_unmapped`.
- The `checkout_evidence_mismatch` and `merchant_binding_required` error codes. The API no longer returns them, so delete any branch that compares against them.
- `approveMcpOauthAuthorizationBodySchema` from `@blazingagents/sdk/contracts`. It described a dashboard-only route that no longer exists.

## 0.41.0

### Changed

- `TaskRunResponse.errorCode` is now `BlazingAgentsErrorCode | null`, an open string, the type thrown errors already use. `tasks.getRun()` and `tasks.listRuns()` no longer throw `invalid_response` on a run that ended with an error code newer than this SDK, and the platform can add a code without an SDK release first. Listed codes still autocomplete. An exhaustive `switch` over `run.errorCode` now needs a `default` branch:

  ```ts
  switch (run.errorCode) {
    case "usage_credit_required":
      // …
      break;
    default:
      // any other code, including one this SDK version does not list
      break;
  }
  ```

## 0.40.0

### Added

- `ErrorCode` includes `merchant_connection_in_use`: `DELETE /v1/merchant-connection` and `POST /v1/merchant-connection` return it with 409 while a request admitted on the current merchant connection is still running. `TaskRun.errorCode` accepts it too.

## 0.39.0

### Added

- `ErrorCode` includes `subscription_not_cancelled`: `DELETE /v1/tenant` returns it with 409 while the tenant's subscription still renews. `TaskRun.errorCode` accepts it too.

## 0.38.0

### Added

- `ErrorCode` includes `subscription_already_paid`: `POST /v1/checkouts` returns it with 409 when the tenant already pays, or when Polar reports an earlier checkout as paid. `TaskRun.errorCode` accepts it too.

## 0.37.0

### Added

- `TaskRun.errorCode` is the API error code a `blocked` or `failed` run ended with, such as `usage_credit_required`, `quota_exceeded` or `provider_required`. It is `null` for every other run and for a failure without a code; `error` still carries the message. `tasks.getRun()` and `tasks.listRuns()` return it.

## 0.36.0

### Added

- Provider, MCP connection, chat connection, chat delivery and merchant connection methods (every operation the API contract marks `x-credential-bearing`) now throw `BlazingAgentsError` with code `credential_echo` when a successful response contains a credential field such as `apiKey`, `botToken` or `clientSecret`. The error carries `details.field` and the request ID; the response body is discarded and never attached to the error. Nothing changes for a correct response.

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
