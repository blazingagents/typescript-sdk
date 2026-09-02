import { Cron } from "croner";
import { z } from "zod";
import { paginatedResponseSchema } from "../api.ts";
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
import { agentVersionNumberSchema } from "./agents.ts";
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

export type TaskScheduleInput = z.infer<typeof taskScheduleInputSchema>;

const taskNameSchema = z.string().trim().min(1).max(MAX_TASK_NAME_LENGTH);
const taskPromptSchema = z.string().trim().min(1).max(MAX_TASK_PROMPT_LENGTH);

/**
 * `POST /v1/tasks` — schedule present = scheduled task; absent = on-demand.
 * `submit: true` enqueues a run immediately (on-demand's only trigger
 * alongside creation) with a server-minted random run id. This path is
 * NOT idempotent — each call creates a new task + new run. For run-level
 * idempotency, use `POST /v1/tasks/{taskId}/runs` with an idempotency key
 * (the task must already exist so the deterministic run id is stable
 * across replays).
 */
export const createTaskBodySchema = z
  .object({
    agentId: agentIdSchema,
    agentVersion: agentVersionNumberSchema.nullable().default(null),
    name: taskNameSchema,
    prompt: taskPromptSchema,
    schedule: taskScheduleInputSchema.nullable().default(null),
    enabled: z.boolean().default(true),
    submit: z.boolean().default(false),
    userId: userIdSchema.default(""),
    metadata: metadataSchema.default({}),
  })
  .strict();

// `PATCH /v1/tasks/{taskId}` — name/prompt/schedule/enabled/metadata;
// agentId + userId immutable.
export const updateTaskBodySchema = z
  .object({
    agentVersion: agentVersionNumberSchema.nullable().optional(),
    name: taskNameSchema.optional(),
    prompt: taskPromptSchema.optional(),
    schedule: taskScheduleInputSchema.nullable().optional(),
    enabled: z.boolean().optional(),
    metadata: metadataSchema.optional(),
  })
  .strict()
  .refine(hasObjectKeys, {
    message: atLeastOneFieldMessage,
  });

// `POST /v1/tasks/{taskId}/runs` — optional client idempotency key.
export const createTaskRunBodySchema = z
  .object({
    idempotencyKey: z.string().trim().min(1).optional(),
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

// The task record — pure definition; state lives in its runs.
export const taskSchema = z
  .object({
    id: taskIdSchema,
    tenantId: tenantIdSchema,
    agentId: agentIdSchema,
    agentVersion: agentVersionNumberSchema.nullable(),
    name: taskNameSchema,
    prompt: taskPromptSchema,
    schedule: taskScheduleInputSchema.nullable(),
    enabled: z.boolean(),
    activeRunId: taskRunIdSchema.nullable(),
    latestRunId: taskRunIdSchema.nullable(),
    userId: userIdSchema,
    metadata: metadataSchema,
    deletedAt: z.iso.datetime({ offset: true }).nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

// Compact run embed for list items — kills N+1 status polling.
export const taskLatestRunSchema = z
  .object({
    id: taskRunIdSchema,
    status: taskRunStatusSchema,
    finishedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();

export const taskListItemSchema = taskSchema.extend({
  latestRun: taskLatestRunSchema.nullable(),
});

export const tasksListResponseSchema =
  paginatedResponseSchema(taskListItemSchema);

export const tasksListQuerySchema = z
  .object({
    agentId: agentIdSchema.optional(),
    userId: z.string().optional(),
    cursor: z.string().nullable().optional(),
  })
  .strict();

export const taskResponseSchema = taskSchema;

// Task run record. `userId`/`metadata` are inherited from the task at
// enqueue (immutable thereafter); the run's session and usage facts carry
// the same attribution.
export const taskRunSchema = z
  .object({
    id: taskRunIdSchema,
    taskId: taskIdSchema,
    tenantId: tenantIdSchema,
    agentId: agentIdSchema,
    agentVersion: agentVersionNumberSchema,
    sessionId: sessionIdSchema.nullable(),
    turnId: turnIdSchema.nullable(),
    status: taskRunStatusSchema,
    error: z.string().nullable(),
    userId: userIdSchema,
    metadata: metadataSchema,
    startedAt: z.iso.datetime({ offset: true }).nullable(),
    finishedAt: z.iso.datetime({ offset: true }).nullable(),
    cancelRequestedAt: z.iso.datetime({ offset: true }).nullable(),
    canceledAt: z.iso.datetime({ offset: true }).nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const taskRunResponseSchema = taskRunSchema;

export const taskRunsListResponseSchema =
  paginatedResponseSchema(taskRunSchema);

// `POST /v1/tasks` response — the created task + optional queued run id.
export const createTaskResponseSchema = z
  .object({
    task: taskSchema,
    runId: taskRunIdSchema.nullable(),
  })
  .strict();

// `POST /v1/tasks/{taskId}/runs` response — the queued run id.
export const createTaskRunResponseSchema = z
  .object({
    runId: taskRunIdSchema,
  })
  .strict();

// `GET .../runs/{runId}/messages` — task-run session transcript, paginated,
// plus `status`, `error`, and `finishedAt` for a single client poll loop.
// `latestCursor` remains the tail position for the next `?after=` request.
export const taskRunMessagesResponseSchema = sessionMessagesResponseSchema
  .extend({
    error: z.string().nullable(),
    finishedAt: z.iso.datetime({ offset: true }).nullable(),
    status: taskRunStatusSchema,
  })
  .strict();

export type Task = z.infer<typeof taskSchema>;
export type TaskListItem = z.infer<typeof taskListItemSchema>;
export type TaskLatestRun = z.infer<typeof taskLatestRunSchema>;
export type TasksListResponse = z.infer<typeof tasksListResponseSchema>;
export type TasksListQuery = z.infer<typeof tasksListQuerySchema>;
export type TaskResponse = z.infer<typeof taskResponseSchema>;
export type TaskRun = z.infer<typeof taskRunSchema>;
export type TaskRunResponse = z.infer<typeof taskRunResponseSchema>;
export type TaskRunStatus = z.infer<typeof taskRunStatusSchema>;
export type TaskRunsListResponse = z.infer<typeof taskRunsListResponseSchema>;
export type CreateTaskBody = z.input<typeof createTaskBodySchema>;
export type UpdateTaskBody = z.infer<typeof updateTaskBodySchema>;
export type CreateTaskRunBody = z.infer<typeof createTaskRunBodySchema>;
export type CreateTaskResponse = z.infer<typeof createTaskResponseSchema>;
export type CreateTaskRunResponse = z.infer<typeof createTaskRunResponseSchema>;
export type TaskRunMessagesResponse = z.infer<
  typeof taskRunMessagesResponseSchema
>;
export type TaskScheduleKind = z.infer<typeof taskScheduleKindSchema>;
