import { BlazingAgents } from "../client.ts";
import type {
  BlazingAgentsFetch,
  BlazingAgentsUIMessageChunk,
} from "../types.ts";
import { createMockFetch } from "./fixtures.ts";

export const BASE = "http://localhost:8787";
export const mintedSessionId = "ss_0123456789abcdef";
export const createLocation = `/v1/agents/ag_0123456789abcdef/sessions/${mintedSessionId}`;

export const chatMessageMetadata = {
  blazingAgents: {
    usage: {
      agentId: "ag_0123456789abcdef",
      agentVersion: 1,
      commitId: "commit-1",
      completedAt: "2026-07-16T10:00:01.000Z",
      durationMs: 1000,
      errorMessage: null,
      inputTokens: 4,
      modelDurationMs: 250,
      metadata: {},
      modelId: "openrouter/test-model",
      outputTokens: 2,
      turnId: "turn_0123456789abcdef",
      sessionId: mintedSessionId,
      startedAt: "2026-07-16T10:00:00.000Z",
      status: "succeeded" as const,
      stepUsages: [{ inputTokens: 4, outputTokens: 2, stepNumber: 0 }],
      tenantId: "ten_0123456789abcdef",
      userId: "",
    },
  },
};

export const chatChunks = [
  { type: "start", messageId: "msg_1", messageMetadata: chatMessageMetadata },
  { type: "start-step" },
  { type: "text-start", id: "t1" },
  { type: "text-delta", id: "t1", delta: "Hello " },
  { type: "text-delta", id: "t1", delta: "world" },
  { type: "text-end", id: "t1" },
  { type: "reasoning-start", id: "r1" },
  { type: "reasoning-delta", id: "r1", delta: "Thinking" },
  { type: "reasoning-end", id: "r1" },
  {
    type: "tool-input-start",
    toolCallId: "call-1",
    toolName: "agents",
  },
  {
    type: "tool-input-delta",
    toolCallId: "call-1",
    inputTextDelta: '{"action":"list"}',
  },
  {
    type: "tool-input-available",
    toolCallId: "call-1",
    toolName: "agents",
    input: { action: "list" },
  },
  {
    type: "tool-approval-request",
    approvalId: "approval-1",
    toolCallId: "call-1",
  },
  {
    type: "tool-approval-response",
    approvalId: "approval-1",
    approved: true,
  },
  {
    type: "tool-output-available",
    toolCallId: "call-1",
    output: { agents: [] },
  },
  {
    type: "tool-input-error",
    toolCallId: "call-input-error",
    toolName: "agents",
    input: { action: "unknown" },
    errorText: "Invalid Tool input",
  },
  {
    type: "tool-input-available",
    toolCallId: "call-output-error",
    toolName: "agents",
    input: { action: "get" },
  },
  {
    type: "tool-output-error",
    toolCallId: "call-output-error",
    errorText: "Tool execution failed",
  },
  {
    type: "tool-input-available",
    toolCallId: "call-denied",
    toolName: "agents",
    input: { action: "delete" },
  },
  {
    type: "tool-approval-request",
    approvalId: "approval-denied",
    toolCallId: "call-denied",
  },
  {
    type: "tool-approval-response",
    approvalId: "approval-denied",
    approved: false,
    reason: "Keep the Agent",
  },
  { type: "tool-output-denied", toolCallId: "call-denied" },
  { type: "finish-step" },
  {
    type: "message-metadata",
    messageMetadata: chatMessageMetadata,
  },
  {
    type: "finish",
    finishReason: "stop",
    messageMetadata: chatMessageMetadata,
  },
] satisfies BlazingAgentsUIMessageChunk[];

export const chatErrorChunks = [
  { type: "start", messageId: "msg_error" },
  { type: "error", errorText: "Safe streamed error" },
] satisfies BlazingAgentsUIMessageChunk[];

export const chatAbortChunks = [
  { type: "start", messageId: "msg_abort" },
  { type: "text-start", id: "abort-text" },
  {
    type: "text-delta",
    id: "abort-text",
    delta: "Partial response",
  },
  { type: "text-end", id: "abort-text" },
  { type: "abort", reason: "caller cancelled" },
] satisfies BlazingAgentsUIMessageChunk[];

export function client(fetch: BlazingAgentsFetch): BlazingAgents {
  return new BlazingAgents({
    apiKey: "ba_test",
    baseUrl: BASE,
    fetch,
  });
}

export function createMockCreateFetch(
  stream: ReadableStream<Uint8Array>
): ReturnType<typeof createMockFetch> {
  return createMockFetch({
    headers: { location: createLocation },
    status: 201,
    stream,
  });
}
