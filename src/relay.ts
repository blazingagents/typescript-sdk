import { safeValidateUIMessages, type UIMessage } from "ai";
import { z } from "zod";
import type { BlazingAgents } from "./client.ts";
import { sessionIdSchema } from "./contracts/ids.ts";
import { BlazingAgentsError } from "./errors.ts";

export interface RelayContext {
  agentId: string;
  metadata?: Record<string, unknown>;
  userId: string;
  version?: number;
}

export interface SessionOwnershipStore {
  ownerOf(sessionId: string): Promise<string | undefined>;
  recordOwner(sessionId: string, userId: string): Promise<void>;
}

interface RelayOptions {
  client: Pick<BlazingAgents, "chat" | "completion">;
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

export function createChatRelay(
  options: RelayOptions & { sessions: SessionOwnershipStore }
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
      const chatInput = {
        agentId: context.agentId,
        message: validated.data[0] as UIMessage,
        messageId: body.messageId,
        metadata: context.metadata,
        signal: request.signal,
        userId: context.userId,
      };
      const result = await options.client.chat(
        body.sessionId === undefined
          ? {
              ...chatInput,
              trigger: "submit-message",
              version: context.version,
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

export function createCompletionRelay(
  options: RelayOptions
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
        signal: request.signal,
        userId: context.userId,
        version: context.version,
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
    return errorResponse(status, error.code, error.message, headers);
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
