import {
  type UseBlazingAgentsChatResult,
  useBlazingAgentsChat,
} from "@blazingagents/sdk/react";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { expect, it } from "vitest";

it("server-renders the installed chat hook before any history read", () => {
  let rendered: UseBlazingAgentsChatResult | undefined;
  function Chat() {
    rendered = useBlazingAgentsChat({ api: "/api/chat" });
    return createElement("p", null, `${rendered.messages.length} messages`);
  }

  expect(renderToString(createElement(Chat))).toBe("<p>0 messages</p>");
  expect(rendered).toMatchObject({
    error: undefined,
    sessionId: undefined,
    status: "restoring",
  });
});
