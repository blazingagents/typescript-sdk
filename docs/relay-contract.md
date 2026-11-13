# Browser relay contract

`BlazingAgentsChatTransport`, `BlazingAgentsChat`, and `useBlazingAgentsChat`
(from `@blazingagents/sdk/react`) reach the Blazing Agents API through one
endpoint on the app's backend, because the browser holds no API key. `createChatRelay`
implements that endpoint in TypeScript. A relay in Python, Go, Rust, or any
other language serves the same browser code when it follows this contract.
`src/chat-relay-wire.ts` holds the schemas that `createChatRelay` and the
transport share.

## Requests

The browser sends every request as `POST` with `Content-Type:
application/json` to one URL that the app picks. The transport defaults to
`/api/chat`. The JSON body's `op` selects the operation. The body also carries
the transport's `body` option extras, so the relay ignores keys it does not
know.

The relay authenticates the request its own way, then resolves the End-user
and the Agent. It sends every API request as that End-user, with the
`X-BA-User-Id` header that `client.forUser(userId)` sets. It never reads the
End-user or the Agent from the request body.

| `op` | Request body | API request | Success response |
| --- | --- | --- | --- |
| `chat` | `{ op, message, messageId?, sessionId?, trigger? }` | A user `message` without `sessionId`: `POST /v1/agents/{agentId}/sessions`. A user `message` with `sessionId`: `POST /v1/agents/{agentId}/sessions/{sessionId}`. An assistant `message`: `POST /v1/agents/{agentId}/sessions/{sessionId}/tool-approvals/continue`. | The API's status and AI SDK UI message stream (`text/event-stream`), with its `Location`, `x-ba-turn-id`, and `x-request-id` headers. |
| `history` | `{ op, sessionId, cursor? }` | `GET /v1/agents/{agentId}/sessions/{sessionId}/messages?limit=200`, plus `&cursor={cursor}` when the body has one. | `200` with `{ "data": [...], "nextCursor": string \| null }`. |
| `steer` | `{ op, sessionId, requestId, message }` | `POST /v1/agents/{agentId}/sessions/{sessionId}/inputs` with `{ "requestId", "message" }`. | `202` with `{ "state": "accepted" \| "committed" \| "not_placed" }`. |

### Fields

| Field | Type and rule |
| --- | --- |
| `op` | Required. `"chat"`, `"history"`, or `"steer"`. |
| `sessionId` | `ss_` and 16 characters from `0-9A-Za-z`. Optional for `chat`, where its absence starts a new Session. Required for `history` and `steer`. |
| `message` | An AI SDK `UIMessage`: `{ id, role, parts, metadata? }`. For `chat`, it is the last user message, or the last assistant message when that message holds a complete Tool approval round. For `steer`, it is a user message. |
| `messageId` | `chat` only. A non-empty string that names the message to regenerate. |
| `trigger` | `chat` only. `"submit-message"` (the default) or `"regenerate-message"`. A new Session always uses `"submit-message"`. |
| `cursor` | `history` only. A non-empty string: the `nextCursor` of the previous page. |
| `requestId` | `steer` only. 1 to 128 characters, and not `.` or `..`. The same `requestId` with the same message replays the receipt. |

### Operation rules

- `chat` with a user message forwards `message`, `messageId`, `trigger`, and the relay's own attribution `metadata`.
- `chat` with an assistant message sends the approval decisions of that message's last step: each Tool part in state `approval-responded` after the last `step-start` part, as `{ approvalId, approved, reason? }`. A message without a decision, or a body without `sessionId`, answers `400`.
- A browser abort of a `chat` request cancels the API request, which cancels the Turn.
- `history` returns one API page and forwards `data` without validating it. The first page is the newest. Messages are oldest first within a page. The relay drops the API's `latestCursor`.
- `steer` answers with the receipt's `state` only.

## Errors

Every error body is `{ "error": { "code": string, "message": string } }`. The
relay copies the API's `x-request-id` header when the API sent one.

| Status | `code` | When |
| --- | --- | --- |
| `400` | `invalid_request` | The body is not JSON, has no known `op`, or has a field that breaks a rule above, or `message` is not a valid `UIMessage` of the required role. |
| `401` | `unauthorized` | The relay found no signed-in End-user. |
| The API's status | The API's code | The API answered an error, such as `404 not_found`, `409 steer_not_available`, or `409 input_idempotency_conflict`. |
| `499` | `request_aborted` | The browser aborted the request. Only relays whose runtime reports the abort send it (TypeScript, Go); the browser never reads it either way. |
| `502` | The SDK's code | The API request failed another way, such as `network_error` or `stream_error`. |
| `500` | `internal_error` | Anything else. The message never names the cause. |

## SDK relays

`createChatRelay` (TypeScript), `AsyncChatRelay` and `ChatRelay` (Python), `NewChatRelay` (Go), and `relay::ChatRelay` (Rust) implement this contract. They differ only in requests and failures the browser never produces:

- An optional field sent as JSON `null` is a `400` everywhere except Rust, which treats it as absent. The browser omits unset fields.
- A history page the API answers malformed is `502 invalid_response` in Go and Rust, `500 internal_error` in Python, and passed through in TypeScript.
- An error the resolver raises keeps the API's status and code in TypeScript, Python, and Go, and is a `500` in Rust.
- Go and Rust refuse a body over 15 MiB, the API's own limit.

## How the browser reads the answers

| Answer | What the browser does |
| --- | --- |
| `chat` `Location` header on the first reply | Takes the last path segment as the Session ID. A cross-origin relay must expose `Location` through CORS. |
| `chat` stream that ends with a `finish` chunk | Treats the Turn as stored. |
| `chat` stream that ends without a `finish` chunk: Stop, an `abort` chunk, an `error` chunk, or a dropped connection | Shows the stored transcript and reads `history` again. Each message sent for that Turn, steers included, stays when the history holds its message ID and rolls back when it does not. |
| `chat` error response | Shows it as a `BlazingAgentsError` with the relay's status and `code`, and rolls back without reading `history`. A `404` also forgets the stored Session. |
| `history` `nextCursor` | Requests the next older page with it as `cursor`. Stops at `null`, at a cursor it already sent, or after 50 pages. When it reads history to place the messages of a Turn, it also stops at the first page whose oldest message it already holds. |
| `history` `404` | Forgets the stored Session and starts the next message on a new one. |
| `history` other errors | Shows the error. On restore, reads history again when the request headers change, on the next send, or on `clearError()`. After a Turn that ended without `finish`, rolls back every message sent for it. |
| `steer` `accepted`, or no answer because the request failed in transit | Waits for the Turn in flight. A steer that Turn has not read when its stream ends is sent again as `chat`, with a new message ID, and so is one answered when no Turn is in flight. |
| `steer` `committed` | Treats the message as stored with the Turn. |
| `steer` `not_placed` or `409 steer_not_available` | Sends the message as `chat`, with a new message ID, once the running Turn ends. |

## Known limits

- A steer sent just before Stop can land in the next Turn. The API places a steer in the Turn that runs when the request arrives, so a Turn that starts while the request is in flight stores it, though the browser already resolved its `send()` as `false`.
- When `history` fails after a Turn that read a steer, the browser shows the steer after the Turn's reply. In a Session of more than 200 messages, a later read that stops at the newest page can keep it there, instead of where the Turn stored it, until the next reload.
