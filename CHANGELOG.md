# Changelog

## 0.29.0

### Removed

- `AgentToolDefinition.category`, `AGENT_TOOL_CATEGORIES`, and `AgentToolCategoryId`, deprecated in 0.28.0. Group tools by their first tag and `AGENT_TOOL_GROUPS`, as the 0.28.0 entry shows.

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
