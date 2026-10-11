import { describe, expect, it } from "vitest";
import {
  createWorkspaceBodySchema,
  updateWorkspaceBodySchema,
  workspaceNetworkPolicySchema,
  workspaceSchema,
} from "./workspaces.ts";

const workspace = {
  id: "ws_0123456789abcdef",
  tenantId: "ten_0123456789abcdef",
  tier: "core",
  name: "Build environment",
  userId: "user-42",
  metadata: { tier: "pro" },
  networkPolicy: { mode: "unrestricted" },
  createdAt: "2026-07-11T12:00:00.000Z",
  updatedAt: "2026-07-11T12:00:00.000Z",
} as const;

describe("Workspace contracts", () => {
  it.each(["core", "plus"])("accepts immutable %s tiers", (tier) => {
    expect(workspaceSchema.parse({ ...workspace, tier }).tier).toBe(tier);
    expect(createWorkspaceBodySchema.parse({ tier }).tier).toBe(tier);
    expect(
      updateWorkspaceBodySchema.safeParse({ name: "New", tier }).success
    ).toBe(false);
  });

  it("requires a recognized Workspace tier", () => {
    const { tier: _tier, ...missingTier } = workspace;
    expect(workspaceSchema.safeParse(missingTier).success).toBe(false);
    expect(
      workspaceSchema.safeParse({ ...workspace, tier: "pro" }).success
    ).toBe(false);
    expect(createWorkspaceBodySchema.safeParse({ tier: "pro" }).success).toBe(
      false
    );
  });

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

  it("accepts the exact public resource projection", () => {
    expect(workspaceSchema.parse(workspace)).toEqual(workspace);
    expect(
      workspaceSchema.parse({ ...workspace, attachedAgentId: null })
    ).not.toHaveProperty("attachedAgentId");
  });

  it("accepts a nullable display name", () => {
    expect(workspaceSchema.parse({ ...workspace, name: null }).name).toBeNull();
  });

  it("settles create defaults without provisioning state", () => {
    expect(createWorkspaceBodySchema.parse({})).toEqual({
      tier: "core",
      metadata: {},
      networkPolicy: { mode: "unrestricted" },
      userId: "",
    });
    expect(
      createWorkspaceBodySchema.safeParse({ runtimeId: "private" }).success
    ).toBe(false);
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

describe("additive network policy response fields", () => {
  it.each([
    { mode: "unrestricted" },
    { mode: "offline" },
    { mode: "allowlist", allowedHosts: ["example.com"] },
  ])(
    "strips $mode response additions but rejects them in writes",
    (networkPolicy) => {
      const expanded = { ...networkPolicy, futurePolicy: true };
      expect(
        workspaceSchema.parse({ ...workspace, networkPolicy: expanded })
          .networkPolicy
      ).toEqual(networkPolicy);
      expect(
        createWorkspaceBodySchema.safeParse({ networkPolicy: expanded }).success
      ).toBe(false);
      expect(
        updateWorkspaceBodySchema.safeParse({ networkPolicy: expanded }).success
      ).toBe(false);
    }
  );
});
