// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

/** One server-sent event: optional event name plus joined data lines. */
export interface SseFrame {
  readonly event?: string;
  readonly data: string;
}

/**
 * Decodes a byte stream into server-sent-event frames. Pure with respect to
 * transport: chunk boundaries may fall anywhere, CRLF and LF both terminate
 * lines, comment lines are ignored, and multi-line data is joined with
 * newlines per the SSE specification.
 */
export async function* decodeSseStream(
  source: AsyncIterable<Uint8Array>,
): AsyncGenerator<SseFrame, void, undefined> {
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName: string | undefined;
  let data: string[] = [];

  function* drainLines(): Generator<SseFrame> {
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      let line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);

      if (line === "") {
        if (data.length > 0) {
          yield { ...(eventName === undefined ? {} : { event: eventName }), data: data.join("\n") };
        }
        eventName = undefined;
        data = [];
      } else if (!line.startsWith(":")) {
        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        let value = colon === -1 ? "" : line.slice(colon + 1);
        if (value.startsWith(" ")) value = value.slice(1);
        if (field === "event") eventName = value;
        else if (field === "data") data.push(value);
      }
      newline = buffer.indexOf("\n");
    }
  }

  for await (const chunk of source) {
    buffer += decoder.decode(chunk, { stream: true });
    yield* drainLines();
  }
  // End of source terminates any partial line and flushes the pending frame.
  buffer += `${decoder.decode()}\n\n`;
  yield* drainLines();
}
