import { describe, expect, it } from "vitest";
import {
  createWorkspaceBodySchema,
  updateWorkspaceBodySchema,
  workspaceBackupSchema,
  workspaceListQuerySchema,
  workspaceNetworkPolicySchema,
  workspaceSchema,
  workspacesListResponseSchema,
} from "./workspaces.ts";

const workspace = {
  id: "ws_0123456789abcdef",
  tenantId: "ten_0123456789abcdef",
  name: "Build environment",
  userId: "user-42",
  metadata: { tier: "pro" },
  networkPolicy: { mode: "unrestricted" },
  createdAt: "2026-07-11T12:00:00.000Z",
  updatedAt: "2026-07-11T12:00:00.000Z",
} as const;

describe("Workspace contracts", () => {
  it("supports exactly the three Workspace network policies", () => {
    expect(
      workspaceNetworkPolicySchema.parse({ mode: "unrestricted" })
    ).toEqual({ mode: "unrestricted" });
    expect(
      workspaceNetworkPolicySchema.parse({
        allowedHosts: ["registry.npmjs.org", "*.github.com"],
        mode: "allowlist",
      })
    ).toEqual({
      allowedHosts: ["registry.npmjs.org", "*.github.com"],
      mode: "allowlist",
    });
    expect(workspaceNetworkPolicySchema.parse({ mode: "offline" })).toEqual({
      mode: "offline",
    });
    expect(
      workspaceNetworkPolicySchema.safeParse({ mode: "deny" }).success
    ).toBe(false);
    expect(
      workspaceNetworkPolicySchema.safeParse({
        allowedHosts: [],
        mode: "allowlist",
      }).success
    ).toBe(false);
    expect(
      workspaceNetworkPolicySchema.safeParse({
        allowedHosts: ["stale.example.com"],
        mode: "offline",
      }).success
    ).toBe(false);
  });

  it("validates the serializable Cloudflare directory-backup handle", () => {
    const backup = {
      dir: "/workspace",
      id: "123e4567-e89b-42d3-a456-426614174000",
      localBucket: true,
    } as const;

    expect(workspaceBackupSchema.parse(backup)).toEqual(backup);
    expect(
      workspaceBackupSchema.safeParse({
        dir: "/home",
        extra: true,
        id: "not-a-backup-id",
      }).success
    ).toBe(false);
  });

  it("accepts the exact public resource projection", () => {
    expect(workspaceSchema.parse(workspace)).toEqual(workspace);
    expect(
      workspaceSchema.safeParse({ ...workspace, attachedAgentId: null }).success
    ).toBe(false);
  });

  it("accepts a nullable display name", () => {
    expect(workspaceSchema.parse({ ...workspace, name: null }).name).toBeNull();
  });

  it("settles create defaults without provisioning state", () => {
    expect(createWorkspaceBodySchema.parse({})).toEqual({
      metadata: {},
      networkPolicy: { mode: "unrestricted" },
      userId: "",
    });
    expect(
      createWorkspaceBodySchema.safeParse({ runtimeId: "private" }).success
    ).toBe(false);
  });

  it("supports keyset listing and Attribution filtering", () => {
    expect(workspaceListQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(
      workspaceListQuerySchema.parse({
        cursor: "opaque",
        limit: "200",
        userId: "user-42",
      })
    ).toEqual({ cursor: "opaque", limit: 200, userId: "user-42" });
    expect(workspaceListQuerySchema.safeParse({ limit: 201 }).success).toBe(
      false
    );
    expect(
      workspacesListResponseSchema.parse({
        data: [workspace],
        nextCursor: null,
      })
    ).toEqual({ data: [workspace], nextCursor: null });
  });

  it("requires a mutable update and permits changing the network policy", () => {
    expect(updateWorkspaceBodySchema.parse({ name: null })).toEqual({
      name: null,
    });
    expect(
      updateWorkspaceBodySchema.parse({
        name: "Renamed environment",
        metadata: { tier: "enterprise" },
        networkPolicy: {
          allowedHosts: ["registry.npmjs.org"],
          mode: "allowlist",
        },
      })
    ).toEqual({
      name: "Renamed environment",
      metadata: { tier: "enterprise" },
      networkPolicy: {
        allowedHosts: ["registry.npmjs.org"],
        mode: "allowlist",
      },
    });
    expect(updateWorkspaceBodySchema.safeParse({}).success).toBe(false);
    expect(
      updateWorkspaceBodySchema.safeParse({ userId: "changed" }).success
    ).toBe(false);
  });
});
