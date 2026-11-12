/**
 * `@blazingagents/sdk/react`: the browser chat hook. The only entry that
 * imports `react` and `@ai-sdk/react`; `.` and `./rest` never load them.
 */

// biome-ignore lint/performance/noBarrelFile: package entry point
export {
  type BlazingAgentsChat,
  type UseBlazingAgentsChatOptions,
  useBlazingAgentsChat,
} from "./use-blazing-agents-chat.ts";
