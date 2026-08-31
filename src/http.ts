import { receivedApiErrorResponseSchema } from "./contracts/api.ts";
import { BlazingAgentsError } from "./errors.ts";
import type { HttpConfig, RequestOptions } from "./types.ts";

const DIAGNOSTIC_BODY_LIMIT_BYTES = 64 * 1024;
const INVALID_RESPONSE_MESSAGE = "The server returned an invalid response.";
const NETWORK_ERROR_MESSAGE =
  "Network request failed (fetch threw before any HTTP exchange).";
const REQUEST_ABORTED_MESSAGE =
  "The request was aborted before any HTTP response.";

interface BodyReadResult {
  bodyText: string;
  cause?: unknown;
  diagnosticBody: string;
  diagnosticBodyTruncated: boolean;
  readFailed: boolean;
}

/**
 * The fetch client — a thin wrapper in the stripe/openai-node shape.
 * `apiKey` rides the `Authorization: Bearer ${apiKey}` header; `baseUrl`
 * defaults to the local api dev port. No OpenAI wire compatibility.
 */
function buildUrl(
  baseUrl: string,
  path: string,
  query?: RequestOptions["query"]
): string {
  const url = `${baseUrl}${path}`;
  if (!query) {
    return url;
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      continue;
    }
    params.append(key, String(value));
  }
  const qs = params.toString();
  return qs.length > 0 ? `${url}?${qs}` : url;
}

/**
 * Performs a request and returns the parsed JSON body for success (status
 * 2xx). API errors preserve the tolerant wire envelope; malformed responses
 * become `invalid_response`.
 */
export async function requestJson<T>(
  config: HttpConfig,
  path: string,
  options: RequestOptions = {},
  schema?: { parse(value: unknown): T }
): Promise<T> {
  const response = await rawRequest(config, path, options);
  if (response.status < 200 || response.status >= 300) {
    throw await errorFromResponse(response, options.signal);
  }
  const headers = new Headers(response.headers);
  if (response.status === 204) {
    try {
      return schema === undefined ? (undefined as T) : schema.parse(undefined);
    } catch (cause) {
      throw invalidResponseError(headers, response.status, "", false, cause);
    }
  }

  const read = await readResponseBody(response, false);
  if (read.readFailed) {
    if (isRequestAborted(read.cause, options.signal)) {
      throw requestAbortedError(read.cause);
    }
    throw invalidResponseError(
      headers,
      response.status,
      read.diagnosticBody,
      true,
      read.cause
    );
  }
  try {
    const json = JSON.parse(read.bodyText) as unknown;
    return schema === undefined ? (json as T) : schema.parse(json);
  } catch (cause) {
    throw invalidResponseError(
      headers,
      response.status,
      read.diagnosticBody,
      read.diagnosticBodyTruncated,
      cause
    );
  }
}

/**
 * Performs a request and returns the raw `Response` for streaming paths.
 * Non-2xx bodies are decoded before a caller can observe a streaming body.
 */
export async function requestStream(
  config: HttpConfig,
  path: string,
  options: RequestOptions = {}
): Promise<Response> {
  const response = await rawRequest(config, path, options);
  if (response.status >= 200 && response.status < 300) {
    return response;
  }
  throw await errorFromResponse(response, options.signal);
}

async function rawRequest(
  config: HttpConfig,
  path: string,
  options: RequestOptions
): Promise<Response> {
  const fetchImpl = config.fetch ?? globalThis.fetch;
  const url = buildUrl(config.baseUrl, path, options.query);
  const method = options.method ?? "GET";
  const startedAt = performance.now();
  const clientRequestId = options.clientRequestId ?? config.clientRequestId;
  const headers: Record<string, string> = {
    authorization: `Bearer ${config.apiKey}`,
    ...(options.headers ?? {}),
    ...(clientRequestId === undefined
      ? {}
      : { "x-client-request-id": clientRequestId }),
  };
  let body: BodyInit | FormData | null = options.body ?? null;
  if (options.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(options.json);
  }
  try {
    const response = await fetchImpl(url, {
      method,
      headers,
      body,
      ...(options.signal ? { signal: options.signal } : {}),
    });
    try {
      config.onResponse?.({
        method,
        path,
        status: response.status,
        durationMs: performance.now() - startedAt,
        requestId: response.headers.get("x-request-id") ?? undefined,
        ...(clientRequestId === undefined ? {} : { clientRequestId }),
      });
    } catch {
      /** Observation must not affect transport or response ownership. */
    }
    return response;
  } catch (cause) {
    const requestAborted = isRequestAborted(cause, options.signal);
    if (requestAborted) {
      throw requestAbortedError(cause);
    }
    let message = NETWORK_ERROR_MESSAGE;
    if (cause instanceof Error) {
      message = cause.message;
    }
    throw new BlazingAgentsError(
      {
        code: "network_error",
        message,
      },
      { cause }
    );
  }
}

async function errorFromResponse(
  response: Response,
  signal?: AbortSignal
): Promise<BlazingAgentsError> {
  const read = await readResponseBody(response, true);
  if (read.readFailed && isRequestAborted(read.cause, signal)) {
    return requestAbortedError(read.cause);
  }
  const headers = new Headers(response.headers);
  if (read.readFailed || read.diagnosticBodyTruncated) {
    return invalidResponseError(
      headers,
      response.status,
      read.diagnosticBody,
      read.diagnosticBodyTruncated,
      read.cause
    );
  }
  return parseErrorEnvelope(read.diagnosticBody, response.status, headers);
}

function isRequestAborted(cause: unknown, signal?: AbortSignal): boolean {
  return (
    signal?.aborted === true ||
    (cause !== null &&
      typeof cause === "object" &&
      "name" in cause &&
      cause.name === "AbortError")
  );
}

function requestAbortedError(cause: unknown): BlazingAgentsError {
  return new BlazingAgentsError(
    {
      code: "request_aborted",
      message: cause instanceof Error ? cause.message : REQUEST_ABORTED_MESSAGE,
    },
    { cause }
  );
}

/**
 * Reads a response while retaining at most 64 KiB of UTF-8 diagnostics.
 * Error responses stop as soon as the body is known to exceed the limit.
 * Successful JSON responses continue so legitimate large payloads can parse.
 */
async function readResponseBody(
  response: Response,
  stopAtDiagnosticLimit: boolean
): Promise<BodyReadResult> {
  if (response.body === null) {
    return {
      bodyText: "",
      diagnosticBody: "",
      diagnosticBodyTruncated: false,
      readFailed: false,
    };
  }

  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = response.body.getReader();
  } catch (cause) {
    return {
      bodyText: "",
      cause,
      diagnosticBody: "",
      diagnosticBodyTruncated: true,
      readFailed: true,
    };
  }

  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  while (true) {
    let read: ReadableStreamReadResult<Uint8Array>;
    try {
      read = await reader.read();
    } catch (cause) {
      const diagnostic = decodeDiagnosticChunks(
        chunks,
        Math.min(byteLength, DIAGNOSTIC_BODY_LIMIT_BYTES),
        true
      );
      return {
        bodyText: "",
        cause,
        diagnosticBody: diagnostic.body,
        diagnosticBodyTruncated: true,
        readFailed: true,
      };
    }

    if (read.done) {
      const diagnostic = decodeDiagnosticChunks(
        chunks,
        Math.min(byteLength, DIAGNOSTIC_BODY_LIMIT_BYTES),
        byteLength > DIAGNOSTIC_BODY_LIMIT_BYTES
      );
      return {
        bodyText: stopAtDiagnosticLimit
          ? diagnostic.body
          : decodeChunks(chunks, byteLength, false),
        diagnosticBody: diagnostic.body,
        diagnosticBodyTruncated: diagnostic.truncated,
        readFailed: false,
      };
    }

    const chunk = read.value;
    if (
      stopAtDiagnosticLimit &&
      byteLength + chunk.byteLength > DIAGNOSTIC_BODY_LIMIT_BYTES
    ) {
      const remaining = DIAGNOSTIC_BODY_LIMIT_BYTES - byteLength;
      if (remaining > 0) {
        chunks.push(chunk.slice(0, remaining));
        byteLength += remaining;
      }
      return cancelTruncatedBody(reader, chunks, byteLength);
    }
    chunks.push(chunk);
    byteLength += chunk.byteLength;
  }
}

async function cancelTruncatedBody(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  chunks: Uint8Array[],
  byteLength: number
): Promise<BodyReadResult> {
  const diagnosticBody = decodeDiagnosticChunks(chunks, byteLength, true).body;
  try {
    await reader.cancel();
    return {
      bodyText: diagnosticBody,
      diagnosticBody,
      diagnosticBodyTruncated: true,
      readFailed: false,
    };
  } catch (cause) {
    return {
      bodyText: diagnosticBody,
      cause,
      diagnosticBody,
      diagnosticBodyTruncated: true,
      readFailed: true,
    };
  }
}

function decodeDiagnosticChunks(
  chunks: Uint8Array[],
  byteLength: number,
  sourceTruncated: boolean
): { body: string; truncated: boolean } {
  const body = decodeChunks(chunks, byteLength, sourceTruncated);
  const encoded = new TextEncoder().encode(body);
  if (encoded.byteLength <= DIAGNOSTIC_BODY_LIMIT_BYTES) {
    return { body, truncated: sourceTruncated };
  }
  return {
    body: decodeChunks(
      [encoded.slice(0, DIAGNOSTIC_BODY_LIMIT_BYTES)],
      DIAGNOSTIC_BODY_LIMIT_BYTES,
      true
    ),
    truncated: true,
  };
}

function decodeChunks(
  chunks: Uint8Array[],
  byteLength: number,
  truncated: boolean
): string {
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    if (offset === byteLength) {
      break;
    }
    const retained = chunk.subarray(0, byteLength - offset);
    bytes.set(retained, offset);
    offset += retained.byteLength;
  }
  return new TextDecoder().decode(bytes, truncated ? { stream: true } : {});
}

/**
 * Decodes a response body with the tolerant consumer schema. Unknown future
 * codes and fields remain valid; malformed responses never infer a domain
 * code from HTTP status.
 */
export function parseErrorEnvelope(
  bodyText: string,
  status: number,
  headers: Headers = new Headers()
): BlazingAgentsError {
  let parsed: unknown;
  if (bodyText.length === 0) {
    parsed = null;
  } else {
    try {
      parsed = JSON.parse(bodyText) as unknown;
    } catch (cause) {
      return invalidResponseError(headers, status, bodyText, false, cause);
    }
  }

  const result = receivedApiErrorResponseSchema.safeParse(parsed);
  if (result.success) {
    return new BlazingAgentsError({
      code: result.data.error.code,
      details: result.data.error.details,
      headers,
      message: result.data.error.message,
      param: result.data.error.param,
      requestId: headers.get("x-request-id") ?? undefined,
      status,
    });
  }
  return invalidResponseError(headers, status, bodyText, false);
}

function invalidResponseError(
  headers: Headers,
  status: number,
  responseBody: string,
  responseBodyTruncated: boolean,
  cause?: unknown
): BlazingAgentsError {
  return new BlazingAgentsError(
    {
      code: "invalid_response",
      headers,
      message: INVALID_RESPONSE_MESSAGE,
      requestId: headers.get("x-request-id") ?? undefined,
      responseBody,
      responseBodyTruncated: responseBodyTruncated ? true : undefined,
      status,
    },
    cause === undefined ? undefined : { cause }
  );
}
