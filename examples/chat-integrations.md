
# Chat integrations

Use `client.chatConnections` to connect an Agent to Slack or Telegram.
BA handles incoming messages, replies, and approvals.

## Create a Telegram connection

Use an existing configured Agent. Set `BLAZING_AGENTS_BASE_URL` to the API origin
(without `/v1`), `BLAZING_AGENTS_API_KEY`, `BA_AGENT_ID`, `TELEGRAM_BOT_ID`,
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, and `CHAT_WEBHOOK_URL`.
See [callback setup](https://docs.blazingagents.com/platform/chat-integrations) for the create-and-update sequence. Use an initial HTTPS URL for
`CHAT_WEBHOOK_URL`; the example saves the final callback after creation.
Run this once on a trusted backend.

```typescript
import { BlazingAgents } from "@blazingagents/sdk";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}`);
  return value;
}

const baseUrl = env("BLAZING_AGENTS_BASE_URL").replace(/\/+$/, "");
const client = new BlazingAgents({
  apiKey: env("BLAZING_AGENTS_API_KEY"),
  baseUrl,
});
const connection = await client.chatConnections.create({
  name: "Support on Telegram",
  agentId: env("BA_AGENT_ID"),
  platform: "telegram",
  enabled: false,
  configuration: {
    botId: env("TELEGRAM_BOT_ID"),
    webhookUrl: env("CHAT_WEBHOOK_URL"),
  },
  credentials: {
    botToken: env("TELEGRAM_BOT_TOKEN"),
    webhookSecret: env("TELEGRAM_WEBHOOK_SECRET"),
  },
});
const webhookUrl = `${baseUrl}/v1/chat/webhooks/telegram/${connection.id}`;
await client.chatConnections.update({
  chatConnectionId: connection.id,
  webhookUrl,
});
console.log({ chatConnectionId: connection.id, webhookUrl });
```

Register the printed URL with Telegram using the matching webhook secret, then
call `client.chatConnections.checkHealth({ chatConnectionId })` and
`client.chatConnections.enable({ chatConnectionId })`. See
[Slack and Telegram setup](https://docs.blazingagents.com/platform/chat-integrations)
for registration and permissions.

If creation times out, use `list()` to reconcile before retrying. If the callback
update fails, retry `update()` on the existing connection. Use `get()`,
`rotateCredentials()`, `disable()`, and `delete()` to manage it later.

## Use BA inside an existing Vercel Chat SDK bot

Add this handler where your application's configured `bot` instance is available.
Keep its existing adapters, state store and webhook routes. Install
`@blazingagents/sdk` and its `ai` peer dependency, then set the BA API key and
`BA_AGENT_ID` on the server.

```typescript
import { BlazingAgents } from "@blazingagents/sdk";

const apiKey = process.env.BLAZING_AGENTS_API_KEY;
if (!apiKey) throw new Error("Set BLAZING_AGENTS_API_KEY");
const ba = new BlazingAgents({ apiKey });
const agentId = process.env.BA_AGENT_ID;
if (!agentId) throw new Error("Set BA_AGENT_ID");

bot.onNewMention(async (thread, message) => {
  const result = await ba.completion({ agentId, prompt: message.text });
  await thread.post(await result.text);
});
```

This answers each new mention independently. It does not subscribe to follow-ups,
create a BA Session, or render approval cards. Your bot owns delivery and error
handling. For managed persistent conversations, use the connection setup above.
See [Chat SDK event handlers](https://chat-sdk.dev/docs/handling-events) for
registration in an existing bot. Use a separate bot installation when comparing
this custom handler with a BA-managed connection.
