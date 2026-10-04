import { z } from "zod";
import { turnIdSchema } from "../ids.ts";
import { chatFunctionDefinitionsSchema } from "./chat.ts";
import { sessionMessageSchema } from "./sessions.ts";

export const sessionInputStateSchema = z.enum([
  "accepted",
  "delivered",
  "consumed",
  "committed",
  "cancelled",
  "uncertain",
]);

export const sessionInputModeSchema = z.enum(["queue", "steer"]);
export const sessionInputRequestIdSchema = z
  .string()
  .min(1)
  .max(128)
  .refine((requestId) => requestId !== "." && requestId !== "..", {
    message: "requestId must not be a URL dot segment.",
  });

export const sessionInputSchema = z
  .object({
    requestId: sessionInputRequestIdSchema,
    sequence: z.number().int().positive(),
    message: sessionMessageSchema.extend({ role: z.literal("user") }),
    mode: sessionInputModeSchema,
    state: sessionInputStateSchema,
    turnId: turnIdSchema.nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
    consumedAt: z.iso.datetime({ offset: true }).nullable(),
    reason: z.enum(["stopped", "failed", "owner_lost", "deleted"]).nullable(),
  })
  .strip();

export const sessionActivitySchema = z
  .object({
    state: z.enum(["idle", "running", "stopping", "approval", "paused"]),
    turnId: turnIdSchema.nullable(),
    reason: z
      .enum(["failed", "owner_lost", "function_executor_required"])
      .nullable(),
  })
  .strip();

export const sessionInputResponseSchema = z
  .object({ data: sessionInputSchema, activity: sessionActivitySchema })
  .strip();

export const sessionInputsResponseSchema = z
  .object({
    data: z.array(sessionInputSchema),
    nextCursor: z.string().nullable(),
    activity: sessionActivitySchema,
  })
  .strip();

export const submitSessionInputBodySchema = z
  .object({
    requestId: sessionInputRequestIdSchema,
    /** The HTTP boundary validates the user message with AI SDK. */
    message: z.unknown().refine((message) => message !== undefined),
    whenBusy: sessionInputModeSchema.default("queue"),
  })
  .strict();

export const sessionInputsQuerySchema = z
  .object({
    includeCompleted: z.boolean().default(false),
    limit: z.number().int().min(1).max(200).default(100),
    cursor: z.string().min(1).optional(),
  })
  .strict();

export const stopSessionBodySchema = z
  .object({ turnId: turnIdSchema })
  .strict();

export const stopSessionResponseSchema = z
  .object({ stoppedTurnId: turnIdSchema, activity: sessionActivitySchema })
  .strip();

export const resumeSessionInputsResponseSchema = z
  .object({ activity: sessionActivitySchema })
  .strip();

export type SessionInputState = z.infer<typeof sessionInputStateSchema>;
export type SessionInputMode = z.infer<typeof sessionInputModeSchema>;
export type SessionInput = z.infer<typeof sessionInputSchema>;
export type SessionActivity = z.infer<typeof sessionActivitySchema>;
export type SessionInputResponse = z.infer<typeof sessionInputResponseSchema>;
export type SessionInputsResponse = z.infer<typeof sessionInputsResponseSchema>;
export type SubmitSessionInputBody = z.input<
  typeof submitSessionInputBodySchema
>;
export type SessionInputsQuery = z.input<typeof sessionInputsQuerySchema>;
export type StopSessionBody = z.infer<typeof stopSessionBodySchema>;
export type StopSessionResponse = z.infer<typeof stopSessionResponseSchema>;
export type ResumeSessionInputsResponse = z.infer<
  typeof resumeSessionInputsResponseSchema
>;

export const runSessionInputsBodySchema = z
  .object({ functions: chatFunctionDefinitionsSchema.optional() })
  .strict();
export type RunSessionInputsBody = z.infer<typeof runSessionInputsBodySchema>;
