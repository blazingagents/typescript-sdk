import { describe, expect, it } from "vitest";
import { updateAgentBodySchema } from "./agents.ts";
import {
  updateMcpAttachmentBodySchema,
  updateMcpConnectionBodySchema,
} from "./mcp-connections.ts";
import { updatePromptBodySchema } from "./prompts.ts";
import { updateTaskBodySchema } from "./tasks.ts";
import { updateTenantSettingsBodySchema } from "./tenants.ts";
import { updateWorkspaceBodySchema } from "./workspaces.ts";

const atLeastOneField = "At least one field must be provided.";

describe("update bodies", () => {
  it.each([
    ["updateAgentBodySchema", updateAgentBodySchema, atLeastOneField],
    [
      "updateMcpAttachmentBodySchema",
      updateMcpAttachmentBodySchema,
      atLeastOneField,
    ],
    [
      "updateMcpConnectionBodySchema",
      updateMcpConnectionBodySchema,
      atLeastOneField,
    ],
    ["updatePromptBodySchema", updatePromptBodySchema, atLeastOneField],
    ["updateTaskBodySchema", updateTaskBodySchema, atLeastOneField],
    [
      "updateTenantSettingsBodySchema",
      updateTenantSettingsBodySchema,
      atLeastOneField,
    ],
    [
      "updateWorkspaceBodySchema",
      updateWorkspaceBodySchema,
      "At least one field is required.",
    ],
  ])(
    "%s rejects an empty update with the field message",
    (_, schema, message) => {
      const result = schema.safeParse({});
      expect(result.success).toBe(false);
      expect(result.error?.issues.map((issue) => issue.message)).toEqual([
        message,
      ]);
    }
  );
});
