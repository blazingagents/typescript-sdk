
# Chat integrations

The existing SDK manages your Agent. Use REST to connect it to Slack or Telegram;
BA hosts the Chat SDK runtime and handles incoming messages and approvals.

## Create a Telegram connection

Use an existing configured Agent. Set `BLAZING_AGENTS_BASE_URL` to the API origin
(without `/v1`), `BLAZING_AGENTS_API_KEY`, `BA_AGENT_ID`, `TELEGRAM_BOT_ID`,
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, and `CHAT_WEBHOOK_URL`.
See [callback setup](https://docs.blazingagents.com/platform/chat-integrations) for the create-and-update sequence. Use an initial HTTPS URL for
`CHAT_WEBHOOK_URL`; the example saves the final callback after creation.
Run this once on a trusted backend.

```typescript
const response = await fetch(
  `${process.env.BLAZING_AGENTS_BASE_URL}/v1/chat-connections`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.BLAZING_AGENTS_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Support on Telegram",
      agentId: process.env.BA_AGENT_ID,
      platform: "telegram",
      configuration: {
        botId: process.env.TELEGRAM_BOT_ID,
        webhookUrl: process.env.CHAT_WEBHOOK_URL,
      },
      credentials: {
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
      },
    }),
  },
);
if (!response.ok) throw new Error(`Connection creation failed: ${response.status}`);
const connection = await response.json();
const webhookUrl = `${process.env.BLAZING_AGENTS_BASE_URL}/v1/chat/webhooks/telegram/${connection.id}`;
const updated = await fetch(
  `${process.env.BLAZING_AGENTS_BASE_URL}/v1/chat-connections/${connection.id}`,
  {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${process.env.BLAZING_AGENTS_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ webhookUrl }),
  },
);
if (!updated.ok) throw new Error(`Callback update failed: ${updated.status}`);
console.log(webhookUrl);
```

Register the printed webhook URL with Telegram, run a fresh health check, then DM the
bot. See [Slack and Telegram setup](https://docs.blazingagents.com/platform/chat-integrations) for registration,
permissions, health checks, and conversation behavior.

If creation times out, list your connections and reconcile before retrying.
Connection management has no dedicated SDK methods; use the
[REST reference](https://docs.blazingagents.com/api-reference/rest-api/chat-connections) for lifecycle and repair.

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
