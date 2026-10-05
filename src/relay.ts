import { safeValidateUIMessages, type UIMessage } from "ai";
import { z } from "zod";
import { extractApprovalDecisions } from "./approvals.ts";
import type { BlazingAgents } from "./client.ts";
import { sessionIdSchema } from "./contracts/ids.ts";
import { BlazingAgentsError } from "./errors.ts";
import type { ChatFunctions } from "./functions.ts";

export interface RelayContext {
  agentId: string;
  /** Handlers for this authenticated request and its approved continuation. */
  functions?: ChatFunctions;
  metadata?: Record<string, unknown>;
  userId: string;
}

export interface SessionOwnershipStore {
  ownerOf(sessionId: string): Promise<string | undefined>;
  recordOwner(sessionId: string, userId: string): Promise<void>;
}

interface RelayOptions<Method extends keyof BlazingAgents> {
  client: Pick<BlazingAgents, Method>;
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
 * Relays useChat submissions. An assistant message carrying approval
 * responses submits the complete round and streams the continuation.
 */
export function createChatRelay(
  options: RelayOptions<"chat" | "continueChat"> & {
    sessions: SessionOwnershipStore;
  }
): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      const context = await options.resolveContext(request);
      if (!context) {
        return errorResponse(401, "unauthorized", "Authentication required.");
      }
      const body = chatBodySchema.parse(await request.json());
      const validated = await safeValidateUIMessages({
        messages: [body.message],
      });
      if (!validated.success) {
        return errorResponse(400, "invalid_request", "Invalid chat message.");
      }
      if (
        body.sessionId !== undefined &&
        (await options.sessions.ownerOf(body.sessionId)) !== context.userId
      ) {
        return errorResponse(403, "forbidden", "Session is not available.");
      }
      const message = validated.data[0] as UIMessage;
      if (message.role === "assistant") {
        return await relayApprovalResponses(options.client, {
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
        userId: context.userId,
      };
      const result = await options.client.chat(
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
      const sessionId = await result.sessionId;
      if (body.sessionId === undefined) {
        try {
          await options.sessions.recordOwner(sessionId, context.userId);
        } catch (error) {
          await result
            .toResponse()
            .body?.cancel(error)
            .catch(() => undefined);
          throw error;
        }
      }
      return result.toResponse();
    } catch (error) {
      return safeErrorResponse(error);
    }
  };
}

async function relayApprovalResponses(
  client: Pick<BlazingAgents, "continueChat">,
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

export function createCompletionRelay(
  options: RelayOptions<"completion">
): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      const context = await options.resolveContext(request);
      if (!context) {
        return errorResponse(401, "unauthorized", "Authentication required.");
      }
      const body = completionBodySchema.parse(await request.json());
      const result = await options.client.completion({
        agentId: context.agentId,
        metadata: context.metadata,
        prompt: body.prompt,
        abortSignal: request.signal,
        userId: context.userId,
      });
      return result.toResponse();
    } catch (error) {
      return safeErrorResponse(error);
    }
  };
}

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
