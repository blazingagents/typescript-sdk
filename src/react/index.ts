/**
 * `@blazingagents/sdk/react`: the browser chat hook. The only entry that
 * imports `react`; `.` and `./rest` never load it.
 */

// biome-ignore lint/performance/noBarrelFile: package entry point
export {
  type UseBlazingAgentsChatOptions,
  type UseBlazingAgentsChatResult,
  useBlazingAgentsChat,
} from "./use-blazing-agents-chat.ts";
