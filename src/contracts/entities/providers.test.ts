import { describe, expect, it } from "vitest";

import {
  createProviderBodySchema,
  providerModelsResponseSchema,
  providerResponseSchema,
  providerSchema,
  providersResponseSchema,
  providerTypeSchema,
  updateProviderBodySchema,
} from "./providers.ts";

describe("providerModelsResponseSchema", () => {
  it("accepts the normalized models envelope", () => {
    expect(
      providerModelsResponseSchema.parse({
        models: [{ id: "claude-3-7-sonnet" }, { id: "gpt-4.1" }],
      })
    ).toEqual({
      models: [{ id: "claude-3-7-sonnet" }, { id: "gpt-4.1" }],
    });
  });
});

const tenantId = "ten_xxxxxxxxxxxxxxxx";
const providerId = "prv_xxxxxxxxxxxxxxxx";
const iso = "2026-07-04T00:00:00.000Z";

const baseProvider = {
  id: providerId,
  tenantId,
  name: "OpenRouter",
  providerType: "openrouter" as const,
  baseUrl: null,
  keyFragment: "abcd",
  vaultSecretId: "vault_1",
  createdAt: iso,
  updatedAt: iso,
};

// Wire response shape per ticket 12 — no `vaultSecretId`, no `tenantId`.
const baseProviderResponse = {
  id: providerId,
  name: "OpenRouter",
  providerType: "openrouter" as const,
  baseUrl: null,
  keyFragment: "abcd",
  createdAt: iso,
  updatedAt: iso,
};

describe("providerTypeSchema", () => {
  it("accepts the six supported types", () => {
    for (const t of [
      "openai",
      "anthropic",
      "openrouter",
      "google",
      "vercel_ai_gateway",
      "custom",
    ] as const) {
      expect(providerTypeSchema.parse(t)).toBe(t);
    }
  });

  it("rejects unknown types", () => {
    expect(providerTypeSchema.safeParse("vertex").success).toBe(false);
  });
});

describe("providerSchema", () => {
  it("accepts a complete stored row", () => {
    expect(providerSchema.safeParse(baseProvider).success).toBe(true);
  });

  it("accepts a baseUrl override", () => {
    expect(
      providerSchema.safeParse({
        ...baseProvider,
        baseUrl: "https://api.example.com/v1",
      }).success
    ).toBe(true);
  });

  it("rejects extra fields", () => {
    expect(
      providerSchema.safeParse({ ...baseProvider, extra: true }).success
    ).toBe(false);
  });

  it("rejects an overlong keyFragment", () => {
    expect(
      providerSchema.safeParse({ ...baseProvider, keyFragment: "abcde" })
        .success
    ).toBe(false);
  });
});

describe("providerResponseSchema", () => {
  it("accepts the ticket-12 wire shape", () => {
    expect(providerResponseSchema.safeParse(baseProviderResponse).success).toBe(
      true
    );
  });

  it("rejects the internal-only vaultSecretId field", () => {
    expect(
      providerResponseSchema.safeParse({
        ...baseProviderResponse,
        vaultSecretId: "vault_1",
      }).success
    ).toBe(false);
  });

  it("rejects the internal-only tenantId field", () => {
    expect(
      providerResponseSchema.safeParse({
        ...baseProviderResponse,
        tenantId,
      }).success
    ).toBe(false);
  });

  it("rejects extra fields", () => {
    expect(
      providerResponseSchema.safeParse({ ...baseProviderResponse, extra: true })
        .success
    ).toBe(false);
  });
});

describe("providersResponseSchema", () => {
  it("wraps wire-shape rows under providers", () => {
    expect(
      providersResponseSchema.parse({ providers: [baseProviderResponse] })
    ).toStrictEqual({ providers: [baseProviderResponse] });
  });

  it("rejects a stored row leaking vaultSecretId onto the wire", () => {
    expect(
      providersResponseSchema.safeParse({ providers: [baseProvider] }).success
    ).toBe(false);
  });
});

describe("createProviderBodySchema", () => {
  it("accepts a complete create body", () => {
    expect(
      createProviderBodySchema.parse({
        name: "OpenRouter",
        providerType: "openrouter",
        apiKey: "sk-or-...",
      })
    ).toStrictEqual({
      name: "OpenRouter",
      providerType: "openrouter",
      baseUrl: null,
      apiKey: "sk-or-...",
    });
  });

  it("accepts a Vercel AI Gateway key without vendor credentials or routing", () => {
    expect(
      createProviderBodySchema.parse({
        name: "Gateway",
        providerType: "vercel_ai_gateway",
        apiKey: "vck_test",
      })
    ).toStrictEqual({
      name: "Gateway",
      providerType: "vercel_ai_gateway",
      baseUrl: null,
      apiKey: "vck_test",
    });
  });

  it("rejects a Vercel AI Gateway base URL override", () => {
    expect(
      createProviderBodySchema.safeParse({
        name: "Gateway",
        providerType: "vercel_ai_gateway",
        baseUrl: "https://gateway-proxy.example.com/v1",
        apiKey: "vck_test",
      }).success
    ).toBe(false);
  });

  it("accepts a baseUrl override", () => {
    expect(
      createProviderBodySchema.safeParse({
        name: "Custom",
        providerType: "custom",
        baseUrl: "https://api.example.com/v1",
        apiKey: "k",
      }).success
    ).toBe(true);
  });

  it("rejects an empty apiKey", () => {
    expect(
      createProviderBodySchema.safeParse({
        name: "X",
        providerType: "openai",
        apiKey: "",
      }).success
    ).toBe(false);
  });

  it("rejects an invalid baseUrl", () => {
    expect(
      createProviderBodySchema.safeParse({
        name: "X",
        providerType: "openai",
        baseUrl: "not-a-url",
        apiKey: "k",
      }).success
    ).toBe(false);
  });

  it("rejects a custom provider without baseUrl", () => {
    expect(
      createProviderBodySchema.safeParse({
        name: "Custom No URL",
        providerType: "custom",
        apiKey: "k",
      }).success
    ).toBe(false);
  });

  it("rejects a custom provider with a null baseUrl", () => {
    expect(
      createProviderBodySchema.safeParse({
        name: "Custom Null URL",
        providerType: "custom",
        baseUrl: null,
        apiKey: "k",
      }).success
    ).toBe(false);
  });

  it("accepts a custom provider with a baseUrl", () => {
    expect(
      createProviderBodySchema.safeParse({
        name: "Custom With URL",
        providerType: "custom",
        baseUrl: "https://api.deepseek.com/v1",
        apiKey: "k",
      }).success
    ).toBe(true);
  });
});

describe("updateProviderBodySchema", () => {
  it("accepts display-name updates", () => {
    expect(updateProviderBodySchema.parse({ name: "Renamed" })).toStrictEqual({
      name: "Renamed",
    });
  });

  it("rejects empty updates", () => {
    expect(updateProviderBodySchema.safeParse({}).success).toBe(false);
  });

  it("rejects providerType updates (immutable)", () => {
    expect(
      updateProviderBodySchema.safeParse({ providerType: "openai" }).success
    ).toBe(false);
  });
  it("rejects endpoint updates", () => {
    expect(
      updateProviderBodySchema.safeParse({
        baseUrl: "https://api.example.com/v2",
      }).success
    ).toBe(false);
  });
});
