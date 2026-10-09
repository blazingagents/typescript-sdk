import { DefaultChatTransport, type UIMessage } from "ai";

export class ChatStreamTransport<
  UI_MESSAGE extends UIMessage = UIMessage,
> extends DefaultChatTransport<UI_MESSAGE> {
  /** Native Chat rejects an update job for error chunks, so fail the stream before that job runs. */
  protected override processResponseStream(stream: ReadableStream<Uint8Array>) {
    return super.processResponseStream(stream).pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          if (chunk.type === "error") {
            controller.error(new Error(chunk.errorText));
            return;
          }
          controller.enqueue(chunk);
        },
      })
    );
  }
}
