import { Cron } from "croner";
import { z } from "zod";
import { apiErrorCodeSchema, paginatedResponseSchema } from "../api.ts";
import {
  agentIdSchema,
  sessionIdSchema,
  taskIdSchema,
  taskRunIdSchema,
  tenantIdSchema,
  turnIdSchema,
} from "../ids.ts";
import {
  MAX_TASK_NAME_LENGTH,
  MAX_TASK_PROMPT_LENGTH,
  MIN_TASK_INTERVAL_MS,
} from "../limitations.ts";
import { atLeastOneFieldMessage, hasObjectKeys } from "../utils.ts";
import { agentConfigSchema } from "./agents.ts";
import { metadataSchema, userIdSchema } from "./attribution.ts";
import { sessionMessagesResponseSchema } from "./sessions.ts";

/**
 * Schedule kinds — discriminated union, Cohand's kinds with croner-forked
 * next-run math. `staggerMs` is an optional cron load-spreading offset.
 */
export const taskScheduleKindSchema = z.enum(["once", "interval", "cron"]);

export const taskOnceConfigSchema = z
  .object({
    at: z.iso.datetime({ offset: true }),
  })
  .strict();

export const taskIntervalConfigSchema = z
  .object({
    everyMs: z.number().int().min(MIN_TASK_INTERVAL_MS),
  })
  .strict();

const CRON_FIELDS_SEPARATOR = /\s+/;
const NUMERIC_CRON_EXPRESSION = /^[\d*,/\-\s]+$/;

/** Croner owns cron grammar; the product limits schedules to five numeric fields. */
const cronExpressionSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine(
    (expression) =>
      expression.split(CRON_FIELDS_SEPARATOR).length === 5 &&
      NUMERIC_CRON_EXPRESSION.test(expression),
    { message: "Expected a five-field numeric cron expression." }
  );

/**
 * Canonical IANA timezone: `UTC` or `Area/Location` (optionally
 * `Area/Location/Sublocation`). Rejects legacy abbreviations (`PST`, `GMT`)
 * that `Intl` quietly accepts but `croner` cannot resolve deterministically.
 */
const IANA_TIMEZONE_REGEX =
  /^(UTC|[A-Za-z_]+\/[A-Za-z0-9_+-]+(\/[A-Za-z0-9_+-]+)?)$/;
const ianaTimezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    IANA_TIMEZONE_REGEX,
    "Expected an IANA timezone (e.g. America/New_York)."
  )
  .refine(
    (tz) => {
      try {
        Intl.DateTimeFormat("en-US", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { message: "Unknown IANA timezone." }
  );

/**
 * Croner validates the expression in the schedule's own timezone. The DBOS
 * schedule plan uses that validated expression and timezone unchanged.
 */
export const taskCronConfigSchema = z
  .object({
    expression: cronExpressionSchema,
    staggerMs: z.number().int().min(0).optional(),
    timezone: ianaTimezoneSchema.default("UTC"),
  })
  .strict()
  .superRefine((config, ctx) => {
    try {
      const cron = new Cron(config.expression, {
        paused: true,
        timezone: config.timezone,
      });
      if (cron.nextRun() === null) {
        throw new Error("no next run");
      }
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Invalid cron expression.",
        path: ["expression"],
      });
    }
  });

export const taskScheduleInputSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("once"),
      config: taskOnceConfigSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("interval"),
      config: taskIntervalConfigSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("cron"),
      config: taskCronConfigSchema,
    })
    .strict(),
]);

const taskNameSchema = z.string().trim().min(1).max(MAX_TASK_NAME_LENGTH);
const taskPromptSchema = z.string().trim().min(1).max(MAX_TASK_PROMPT_LENGTH);

/**
 * `POST /v1/tasks` — schedule present = scheduled task; absent = on-demand.
 * `submit: true` enqueues a run immediately. An optional `idempotencyKey`
 * makes retries return the original Task and initial run id. Without a key,
 * each call creates a new Task. Run creation has its own idempotency key.
 */
const taskFieldDescriptions = {
  agentId: "ID of the agent that runs the task. It cannot change later.",
  name: "Display name, 1 to 80 characters.",
  prompt: "The prompt the agent receives on every run, 1 to 6,000 characters.",
  schedule:
    "When the task runs by itself: `once` at a time, every `everyMs` milliseconds (at least 60,000) for `interval`, or a five-field cron expression in an IANA timezone for `cron`. `null` means the task runs only when you start it.",
  enabled:
    "Whether the schedule fires. A disabled task can still be started on demand.",
  submit: "Start a run as soon as the task is created.",
  userId:
    "Your end user's ID, used for attribution. An empty string means a tenant-level task. It cannot change after creation.",
  metadata:
    "Your own key-value data, returned unchanged and copied to each run.",
} as const;

export const createTaskBodySchema = z
  .object({
    idempotencyKey: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        "Retry the same creation with this key to return the current task and its original initial run. Changed requests or deleted tasks return a conflict."
      ),
    agentId: agentIdSchema.describe(taskFieldDescriptions.agentId),
    name: taskNameSchema.describe(taskFieldDescriptions.name),
    prompt: taskPromptSchema.describe(taskFieldDescriptions.prompt),
    schedule: taskScheduleInputSchema
      .nullable()
      .default(null)
      .describe(taskFieldDescriptions.schedule),
    enabled: z.boolean().default(true).describe(taskFieldDescriptions.enabled),
    submit: z.boolean().default(false).describe(taskFieldDescriptions.submit),
    userId: userIdSchema.default("").describe(taskFieldDescriptions.userId),
    metadata: metadataSchema
      .default({})
      .describe(taskFieldDescriptions.metadata),
  })
  .strict();

// `PATCH /v1/tasks/{taskId}` — `agentId` and `userId` are immutable.
export const updateTaskBodySchema = z
  .object({
    name: taskNameSchema.optional().describe(taskFieldDescriptions.name),
    prompt: taskPromptSchema.optional().describe(taskFieldDescriptions.prompt),
    schedule: taskScheduleInputSchema
      .nullable()
      .optional()
      .describe(taskFieldDescriptions.schedule),
    enabled: z.boolean().optional().describe(taskFieldDescriptions.enabled),
    metadata: metadataSchema
      .optional()
      .describe("Your own key-value data. Replaces the current metadata."),
  })
  .strict()
  .refine(hasObjectKeys, {
    message: atLeastOneFieldMessage,
  });

// `POST /v1/tasks/{taskId}/runs` — optional client idempotency key.
export const createTaskRunBodySchema = z
  .object({
    idempotencyKey: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        "Your own key for this run. Retrying with the same key returns the same run instead of starting another."
      ),
  })
  .strict();

/**
 * Task run status. `blocked` is the soft-block terminal state for an expected
 * admission denial, such as quota exhaustion, missing subscription, or
 * insufficient Usage credit. Like the other terminal statuses, it sets
 * `finishedAt` and frees the task's active-run slot for the next scheduled fire.
 */
export const taskRunStatusSchema = z.enum([
  "queued",
  "running",
  "blocked",
  "succeeded",
  "failed",
  "canceled",
]);

/** Response schedules accept additive fields without relaxing schedule writes. */
const taskScheduleResponseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("once"), config: taskOnceConfigSchema.strip() }),
  z.object({
    kind: z.literal("interval"),
    config: taskIntervalConfigSchema.strip(),
  }),
  z.object({ kind: z.literal("cron"), config: taskCronConfigSchema.strip() }),
]);

// The task record — pure definition; state lives in its runs.
export const taskResponseSchema = z
  .object({
    id: taskIdSchema,
    tenantId: tenantIdSchema,
    agentId: agentIdSchema,
    name: taskNameSchema,
    prompt: taskPromptSchema,
    schedule: taskScheduleResponseSchema.nullable(),
    enabled: z.boolean(),
    activeRunId: taskRunIdSchema.nullable(),
    latestRunId: taskRunIdSchema.nullable(),
    userId: userIdSchema,
    metadata: metadataSchema,
    deletedAt: z.iso.datetime({ offset: true }).nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
    nextFireAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strip();

// Compact run embed for list items — kills N+1 status polling.
export const taskLatestRunSchema = z
  .object({
    id: taskRunIdSchema,
    status: taskRunStatusSchema,
    finishedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strip();

export const taskListItemSchema = taskResponseSchema.extend({
  latestRun: taskLatestRunSchema.nullable(),
});

export const tasksListResponseSchema =
  paginatedResponseSchema(taskListItemSchema);

/**
 * Task run record. `userId`/`metadata` are copied from the task at enqueue
 * and carried onto the run's Session and usage facts.
 */
export const taskRunResponseSchema = z
  .object({
    id: taskRunIdSchema,
    taskId: taskIdSchema,
    tenantId: tenantIdSchema,
    agentId: agentIdSchema,
    agentConfig: agentConfigSchema,
    sessionId: sessionIdSchema.nullable(),
    turnId: turnIdSchema.nullable(),
    status: taskRunStatusSchema,
    error: z.string().nullable(),
    errorCode: apiErrorCodeSchema
      .nullable()
      .describe(
        "Machine-readable reason a run ended `blocked` or `failed`: one of the API error codes, such as `usage_credit_required`, `quota_exceeded` or `provider_required`. `null` for every other run, and for a failure without a code; `error` carries the message."
      ),
    userId: userIdSchema,
    metadata: metadataSchema,
    startedAt: z.iso.datetime({ offset: true }).nullable(),
    finishedAt: z.iso.datetime({ offset: true }).nullable(),
    cancelRequestedAt: z.iso.datetime({ offset: true }).nullable(),
    canceledAt: z.iso.datetime({ offset: true }).nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strip();

export const taskRunsListResponseSchema = paginatedResponseSchema(
  taskRunResponseSchema
);

// `POST /v1/tasks` response — the created task + optional queued run id.
export const createTaskResponseSchema = z
  .object({
    task: taskResponseSchema,
    runId: taskRunIdSchema.nullable(),
  })
  .strip();

// `POST /v1/tasks/{taskId}/runs` response — the queued run id.
export const createTaskRunResponseSchema = z
  .object({
    runId: taskRunIdSchema,
  })
  .strip();

/**
 * `GET .../runs/{runId}/messages` — the run transcript plus `status`,
 * `error`, and `finishedAt`, so one poll loop can follow the run.
 */
export const taskRunMessagesResponseSchema = sessionMessagesResponseSchema
  .extend({
    error: z.string().nullable(),
    finishedAt: z.iso.datetime({ offset: true }).nullable(),
    status: taskRunStatusSchema,
  })
  .strip();
export type TaskListItem = z.infer<typeof taskListItemSchema>;
export type TaskRunStatus = z.infer<typeof taskRunStatusSchema>;
export type TaskScheduleInput = z.infer<typeof taskScheduleInputSchema>;
export type TasksListResponse = z.infer<typeof tasksListResponseSchema>;
export type TaskResponse = z.infer<typeof taskResponseSchema>;
export type TaskRunResponse = z.infer<typeof taskRunResponseSchema>;
export type TaskRunsListResponse = z.infer<typeof taskRunsListResponseSchema>;
export type CreateTaskBody = z.input<typeof createTaskBodySchema>;
export type UpdateTaskBody = z.infer<typeof updateTaskBodySchema>;
export type CreateTaskRunBody = z.infer<typeof createTaskRunBodySchema>;
export type CreateTaskResponse = z.infer<typeof createTaskResponseSchema>;
export type CreateTaskRunResponse = z.infer<typeof createTaskRunResponseSchema>;
export type TaskRunMessagesResponse = z.infer<
  typeof taskRunMessagesResponseSchema
>;
