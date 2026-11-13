import { safeValidateUIMessages, type UIMessage } from "ai";
import { z } from "zod";
import { extractApprovalDecisions } from "./approvals.ts";
import {
  RELAY_HISTORY_PAGE_SIZE,
  type RelayRequest,
  type relayHistoryPageSchema,
  relayRequestSchema,
  type relaySteerReceiptSchema,
} from "./chat-relay-wire.ts";
import { BlazingAgentsError } from "./errors.ts";
import type { ChatFunctions } from "./functions.ts";
import type { UserClient } from "./types.ts";

export interface RelayContext {
  /**
   * Agent that serves this request. It must be owned by `userId`, and its
   * Workspace must be owned by the same End-user; otherwise the API answers 404.
   */
  agentId: string;
  /** Handlers for this authenticated request and its approved continuation. */
  functions?: ChatFunctions;
  metadata?: Record<string, unknown>;
  /**
   * The signed-in End-user. The relay scopes every API request to this
   * End-user with `client.forUser(userId)`, so the API only reaches that
   * End-user's Agents, Sessions, and Workspaces. Follows the `forUser` rules:
   * printable ASCII, at most 256 characters, no surrounding spaces.
   */
  userId: string;
}

interface RelayOptions<Method extends keyof UserClient> {
  client: { forUser(userId: string): Pick<UserClient, Method> };
  /**
   * Resolves authenticated Agent and end-user context, or null for an unauthenticated request.
   * @param request - Incoming HTTP request. Its body is unread, so the resolver may read extras the browser sent in it; the relay parses its own copy.
   * @returns Authenticated context, or null when authentication fails.
   */
  resolveContext(request: Request): Promise<RelayContext | null>;
}

const completionBodySchema = z.object({ prompt: z.string().trim().min(1) });

type ChatRelayClient = Pick<UserClient, "chat" | "continueChat" | "sessions">;

/**
 * The browser's one endpoint for a chat, answered as the signed-in End-user.
 * The JSON body's `op` selects the operation: `chat` streams a Turn, `history`
 * returns one page of the Session's stored messages, and `steer` sends a user
 * message into the Turn running now.
 *
 * Every error body is `{ error: { code, message } }`: 400 `invalid_request`
 * for a malformed body or an unknown `op`, 401 `unauthorized`, the API's own
 * status and code (such as 404 `not_found` or 409 `steer_not_available`), 499
 * when the browser aborts, 502 for other SDK failures, and 500 otherwise.
 * @param options - Configuration for this operation.
 * @returns An HTTP handler that runs each request through `client.forUser(context.userId)`, so the API answers 404 for a Session outside that End-user's scope.
 */
export function createChatRelay(
  options: RelayOptions<"chat" | "continueChat" | "sessions">
): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      // The resolver may read the body too, so the relay reads its own copy.
      const copy = request.clone();
      const context = await options.resolveContext(request);
      if (!context) {
        return errorResponse(401, "unauthorized", "Authentication required.");
      }
      const client = scopeTo(options.client, context.userId);
      const body = relayRequestSchema.parse(await copy.json());
      return await answer(client, context, body, request.signal);
    } catch (error) {
      return safeErrorResponse(error);
    }
  };
}

function answer(
  client: ChatRelayClient,
  context: RelayContext,
  body: RelayRequest,
  signal: AbortSignal
): Promise<Response> {
  switch (body.op) {
    case "chat":
      return relayChat(client, context, body, signal);
    case "history":
      return relayHistoryPage(client, context.agentId, body, signal);
    case "steer":
      return relaySteer(client, context.agentId, body, signal);
  }
}

async function relayChat(
  client: ChatRelayClient,
  context: RelayContext,
  body: Extract<RelayRequest, { op: "chat" }>,
  signal: AbortSignal
): Promise<Response> {
  const validated = await safeValidateUIMessages({
    messages: [body.message],
  });
  if (!validated.success) {
    return errorResponse(400, "invalid_request", "Invalid chat message.");
  }
  const message = validated.data[0] as UIMessage;
  if (message.role === "assistant") {
    return await relayApprovalResponses(client, {
      agentId: context.agentId,
      functions: context.functions,
      message,
      signal,
      sessionId: body.sessionId,
    });
  }
  if (message.role !== "user") {
    return errorResponse(
      400,
      "invalid_request",
      "Chat submission requires a user message."
    );
  }
  const chatInput = {
    agentId: context.agentId,
    functions: context.functions,
    message,
    messageId: body.messageId,
    metadata: context.metadata,
    abortSignal: signal,
  };
  const result = await client.chat(
    body.sessionId === undefined
      ? {
          ...chatInput,
          trigger: "submit-message",
        }
      : {
          ...chatInput,
          sessionId: body.sessionId,
          trigger: body.trigger,
        }
  );
  return result.toResponse();
}

/**
 * One page of stored messages, passed through without paging or message
 * validation, so a relay in any language stays a pass-through. The browser
 * walks the pages and validates them.
 */
async function relayHistoryPage(
  client: ChatRelayClient,
  agentId: string,
  body: Extract<RelayRequest, { op: "history" }>,
  signal: AbortSignal
): Promise<Response> {
  const page = await client.sessions.messages({
    agentId,
    sessionId: body.sessionId,
    cursor: body.cursor,
    limit: RELAY_HISTORY_PAGE_SIZE,
    abortSignal: signal,
  });
  return Response.json({
    data: page.data,
    nextCursor: page.nextCursor,
  } satisfies z.input<typeof relayHistoryPageSchema>);
}

/** A 409 `steer_not_available` passes through; the browser resends the message as chat. */
async function relaySteer(
  client: ChatRelayClient,
  agentId: string,
  body: Extract<RelayRequest, { op: "steer" }>,
  signal: AbortSignal
): Promise<Response> {
  const validated = await safeValidateUIMessages({
    messages: [body.message],
  });
  if (!validated.success || validated.data[0].role !== "user") {
    return errorResponse(
      400,
      "invalid_request",
      "Steering requires a user message."
    );
  }
  const receipt = await client.sessions.submitInput({
    agentId,
    sessionId: body.sessionId,
    requestId: body.requestId,
    message: validated.data[0] as UIMessage,
    abortSignal: signal,
  });
  return Response.json(
    { state: receipt.data.state } satisfies z.input<
      typeof relaySteerReceiptSchema
    >,
    { status: 202 }
  );
}

/**
 * Forwards the last assistant approval round to its Session.
 */
async function relayApprovalResponses(
  client: Pick<UserClient, "continueChat">,
  {
    functions,
    message,
    signal,
    ...input
  }: {
    agentId: string;
    functions?: ChatFunctions;
    message: UIMessage;
    signal: AbortSignal;
    sessionId?: string;
  }
): Promise<Response> {
  if (input.sessionId === undefined) {
    return errorResponse(
      400,
      "invalid_request",
      "Tool approval requires an existing Session."
    );
  }
  const target = {
    agentId: input.agentId,
    sessionId: input.sessionId,
    abortSignal: signal,
  };
  const decisions = extractApprovalDecisions(message);
  if (decisions.length === 0) {
    return errorResponse(
      400,
      "invalid_request",
      "The message has no tool approval responses."
    );
  }
  const continuation = await client.continueChat({
    ...target,
    decisions,
    functions: functions ?? {},
  });
  return continuation.toResponse();
}

/**
 * Creates an authenticated HTTP handler that validates prompts and relays text generation as the signed-in End-user.
 * @param options - Configuration for this operation.
 * @returns An HTTP handler that runs each request through `client.forUser(context.userId)`.
 */
export function createCompletionRelay(
  options: RelayOptions<"completion">
): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      const copy = request.clone();
      const context = await options.resolveContext(request);
      if (!context) {
        return errorResponse(401, "unauthorized", "Authentication required.");
      }
      const client = scopeTo(options.client, context.userId);
      const body = completionBodySchema.parse(await copy.json());
      const result = await client.completion({
        agentId: context.agentId,
        metadata: context.metadata,
        prompt: body.prompt,
        abortSignal: request.signal,
      });
      return result.toResponse();
    } catch (error) {
      return safeErrorResponse(error);
    }
  };
}

/**
 * Scopes the client to the resolved End-user. An ID that `forUser` rejects is a
 * Tenant resolver bug, not a browser error, so it becomes a plain error that
 * the generic 500 response answers without the validation message.
 */
function scopeTo<Method extends keyof UserClient>(
  client: RelayOptions<Method>["client"],
  userId: string
): Pick<UserClient, Method> {
  try {
    return client.forUser(userId);
  } catch (cause) {
    throw new Error("The relay context has an invalid userId.", { cause });
  }
}

/**
 * Maps validation and SDK failures to safe public error responses.
 */
function safeErrorResponse(error: unknown): Response {
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return errorResponse(400, "invalid_request", "Invalid request body.");
  }
  if (BlazingAgentsError.isInstance(error)) {
    const status =
      error.status ?? (error.code === "request_aborted" ? 499 : 502);
    const headers = new Headers();
    const requestId = error.requestId ?? error.headers?.get("x-request-id");
    if (requestId) {
      headers.set("x-request-id", requestId);
    }
    return errorResponse(status, error.code, error.message, headers);
  }
  return errorResponse(500, "internal_error", "Request failed.");
}

/**
 * Builds a JSON error envelope with the selected HTTP status.
 */
function errorResponse(
  status: number,
  code: string,
  message: string,
  headers?: Headers
): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "application/json");
  return Response.json(
    { error: { code, message } },
    { status, headers: responseHeaders }
  );
}
