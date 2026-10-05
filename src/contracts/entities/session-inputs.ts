import { z } from "zod";
import { turnIdSchema } from "../ids.ts";
import { sessionMessageSchema } from "./sessions.ts";

export const sessionInputStateSchema = z.enum([
  "accepted",
  "delivered",
  "committed",
  "not_placed",
  "uncertain",
]);

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
    state: sessionInputStateSchema,
    turnId: turnIdSchema,
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
    reason: z
      .enum(["stopped", "failed", "owner_lost", "turn_finished"])
      .nullable(),
  })
  .strip();

export const sessionActivitySchema = z
  .object({
    state: z.enum(["idle", "running", "stopping", "approval"]),
    turnId: turnIdSchema.nullable(),
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

export type SessionInputState = z.infer<typeof sessionInputStateSchema>;
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

/** Provisional placement observation emitted on the owning Turn stream. */
export const chatSteerConsumedEventSchema = z
  .object({
    type: z.literal("data-ba-steer-consumed"),
    transient: z.literal(true),
    data: sessionInputSchema.pick({
      requestId: true,
      turnId: true,
      sequence: true,
      message: true,
    }),
  })
  .strip();
export type ChatSteerConsumedEvent = z.infer<
  typeof chatSteerConsumedEventSchema
>;
