# Changelog

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
