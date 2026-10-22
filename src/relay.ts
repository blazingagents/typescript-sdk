import { safeValidateUIMessages, type UIMessage } from "ai";
import { z } from "zod";
import { extractApprovalDecisions } from "./approvals.ts";
import { sessionIdSchema } from "./contracts/ids.ts";
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
   * @param request - Incoming HTTP request.
   * @returns Authenticated context, or null when authentication fails.
   */
  resolveContext(request: Request): Promise<RelayContext | null>;
}

const chatBodySchema = z.object({
  message: z.unknown(),
  messageId: z.string().min(1).optional(),
  sessionId: sessionIdSchema.optional(),
  trigger: z
    .enum(["submit-message", "regenerate-message"])
    .default("submit-message"),
});

const completionBodySchema = z.object({ prompt: z.string().trim().min(1) });

/**
 * Relays useChat submissions as the signed-in End-user. An assistant message
 * carrying approval responses submits the complete round and streams the
 * continuation.
 * @param options - Configuration for this operation.
 * @returns An HTTP handler that runs each request through `client.forUser(context.userId)`, so the API answers 404 for a Session outside that End-user's scope.
 */
export function createChatRelay(
  options: RelayOptions<"chat" | "continueChat">
): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      const context = await options.resolveContext(request);
      if (!context) {
        return errorResponse(401, "unauthorized", "Authentication required.");
      }
      const client = scopeTo(options.client, context.userId);
      const body = chatBodySchema.parse(await request.json());
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
          request,
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
        abortSignal: request.signal,
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
    } catch (error) {
      return safeErrorResponse(error);
    }
  };
}

/**
 * Forwards the last assistant approval round to its Session.
 */
async function relayApprovalResponses(
  client: Pick<UserClient, "continueChat">,
  {
    functions,
    message,
    request,
    ...input
  }: {
    agentId: string;
    functions?: ChatFunctions;
    message: UIMessage;
    request: Request;
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
    abortSignal: request.signal,
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
      const context = await options.resolveContext(request);
      if (!context) {
        return errorResponse(401, "unauthorized", "Authentication required.");
      }
      const client = scopeTo(options.client, context.userId);
      const body = completionBodySchema.parse(await request.json());
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
    return errorResponse(
      status,
      error.code,
      error.message.slice(`[${error.code}] `.length),
      headers
    );
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
