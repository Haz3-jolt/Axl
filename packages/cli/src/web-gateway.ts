// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createConnection, type Socket } from "node:net";
import { extname, resolve, sep } from "node:path";
import { StringDecoder } from "node:string_decoder";

import { MAX_WIRE_MESSAGE_BYTES, WIRE_PROTOCOL_VERSION } from "@axl/protocol";
import { WebSocketServer, type WebSocket } from "ws";

const SECURITY_HEADERS = {
  "cache-control": "no-store",
  "content-security-policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
} as const;

interface AssetMetadata {
  readonly webAssetVersion: 1;
  readonly wireVersion: number;
  readonly entrypoints: readonly string[];
  readonly sha256: Readonly<Record<string, string>>;
}

export interface WebGatewayOptions {
  readonly socketPath: string;
  readonly assetDirectory: string;
  readonly cwd: string;
  readonly launchToken?: Buffer;
  readonly pathToken?: Buffer;
}

export interface WebGateway {
  readonly origin: string;
  readonly launchUrl: string;
  close(): Promise<void>;
}

function send(
  response: ServerResponse,
  status: number,
  body: string,
  type = "text/plain; charset=utf-8",
): void {
  response.writeHead(status, { ...SECURITY_HEADERS, "content-type": type });
  response.end(body);
}

function safeEqual(actual: string, expected: Buffer): boolean {
  let decoded: Buffer;
  try {
    decoded = Buffer.from(actual, "base64url");
  } catch {
    return false;
  }
  return decoded.length === expected.length && timingSafeEqual(decoded, expected);
}

function cookie(request: IncomingMessage, name: string): string | undefined {
  for (const part of request.headers.cookie?.split(";") ?? []) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return undefined;
}

function mime(path: string): string {
  return (
    (
      {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".svg": "image/svg+xml",
      } as Record<string, string>
    )[extname(path)] ?? "application/octet-stream"
  );
}

export async function verifyWebAssets(directory: string): Promise<AssetMetadata> {
  const metadata = JSON.parse(
    await readFile(resolve(directory, "asset-metadata.json"), "utf8"),
  ) as Partial<AssetMetadata>;
  if (
    metadata.webAssetVersion !== 1 ||
    metadata.wireVersion !== WIRE_PROTOCOL_VERSION ||
    !Array.isArray(metadata.entrypoints) ||
    metadata.entrypoints.length === 0 ||
    typeof metadata.sha256 !== "object" ||
    metadata.sha256 === null
  )
    throw new Error("Web assets are missing or incompatible");
  for (const [file, expected] of Object.entries(metadata.sha256)) {
    if (
      !/^[a-zA-Z0-9_./-]+$/.test(file) ||
      file.startsWith("/") ||
      file.split("/").includes("..") ||
      !/^[0-9a-f]{64}$/.test(expected)
    )
      throw new Error("Web asset metadata is invalid");
    const actual = createHash("sha256")
      .update(await readFile(resolve(directory, file)))
      .digest("hex");
    if (actual !== expected) throw new Error(`Web asset hash mismatch: ${file}`);
  }
  for (const entrypoint of metadata.entrypoints)
    if (!(entrypoint in metadata.sha256))
      throw new Error(`Web entrypoint is not declared: ${entrypoint}`);
  return metadata as AssetMetadata;
}

export async function startWebGateway(options: WebGatewayOptions): Promise<WebGateway> {
  const metadata = await verifyWebAssets(options.assetDirectory);
  const launchToken = options.launchToken ?? randomBytes(32);
  const pathToken = options.pathToken ?? randomBytes(16);
  const browserCredential = randomBytes(32);
  const prefix = `/a/${pathToken.toString("base64url")}/`;
  const cookieName = "axl_web";
  let launchAvailable = true;
  const launchExpiresAt = Date.now() + 60_000;
  const credentialExpiresAt = Date.now() + 12 * 60 * 60 * 1_000;
  let expectedHost = "";
  let expectedOrigin = "";
  const sockets = new Set<Socket>();
  const webSockets = new Set<WebSocket>();
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_WIRE_MESSAGE_BYTES,
    perMessageDeflate: false,
  });

  const authorized = (request: IncomingMessage): boolean =>
    Date.now() < credentialExpiresAt &&
    cookie(request, cookieName) !== undefined &&
    safeEqual(cookie(request, cookieName) ?? "", browserCredential);
  const validOrigin = (request: IncomingMessage): boolean =>
    request.headers.host === expectedHost && request.headers.origin === expectedOrigin;
  const server = createServer(async (request, response) => {
    try {
      if (
        request.headers.host !== expectedHost ||
        request.url === undefined ||
        !request.url.startsWith(prefix)
      )
        return send(response, 404, "Not found");
      const relative = request.url.slice(prefix.length).split("?", 1)[0] ?? "";
      if (request.method === "POST" && relative === "auth/exchange") {
        if (!validOrigin(request) || !launchAvailable || Date.now() >= launchExpiresAt)
          return send(response, 401, "Authentication failed");
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of request) {
          const value = Buffer.from(chunk);
          size += value.length;
          if (size > 4096) return send(response, 413, "Request too large");
          chunks.push(value);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { token?: unknown };
        if (typeof body.token !== "string" || !safeEqual(body.token, launchToken))
          return send(response, 401, "Authentication failed");
        launchAvailable = false;
        response.setHeader(
          "set-cookie",
          `${cookieName}=${browserCredential.toString("base64url")}; Path=${prefix}; HttpOnly; SameSite=Strict; Max-Age=43200`,
        );
        return send(response, 200, "{}", "application/json; charset=utf-8");
      }
      if (request.method === "POST" && relative === "bootstrap") {
        if (!validOrigin(request) || !authorized(request))
          return send(response, 401, "Authentication required");
        return send(
          response,
          200,
          JSON.stringify({ cwd: options.cwd, webSocketPath: `${prefix}ws` }),
          "application/json; charset=utf-8",
        );
      }
      if (request.method !== "GET") return send(response, 405, "Method not allowed");
      const file = relative === "" ? "index.html" : relative;
      if (!(file in metadata.sha256)) return send(response, 404, "Not found");
      if (file.startsWith("/") || file.split("/").includes(".."))
        return send(response, 404, "Not found");
      const path = resolve(options.assetDirectory, file);
      if (
        !path.startsWith(`${resolve(options.assetDirectory)}${sep}`) &&
        path !== resolve(options.assetDirectory, "index.html")
      )
        return send(response, 404, "Not found");
      const data = await readFile(path).catch(() => undefined);
      if (data === undefined) return send(response, 404, "Not found");
      response.writeHead(200, { ...SECURITY_HEADERS, "content-type": mime(path) });
      response.end(data);
    } catch {
      send(response, 400, "Invalid request");
    }
  });

  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  server.on("upgrade", (request, socket, head) => {
    if (
      request.url !== `${prefix}ws` ||
      !validOrigin(request) ||
      !authorized(request) ||
      webSockets.size >= 16
    ) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (webSocket) =>
      wss.emit("connection", webSocket, request),
    );
  });
  wss.on("connection", (webSocket) => {
    webSockets.add(webSocket);
    const daemon = createConnection(options.socketPath);
    let buffer = "";
    const decoder = new StringDecoder("utf8");
    let messages = 0;
    let windowStarted = Date.now();
    const close = (): void => {
      webSockets.delete(webSocket);
      daemon.destroy();
      if (webSocket.readyState < 2) webSocket.close(1000, "Attachment closed");
    };
    webSocket.on("message", (data, binary) => {
      if (binary || Buffer.byteLength(data.toString()) > MAX_WIRE_MESSAGE_BYTES)
        return webSocket.close(1009, "Text message limit exceeded");
      const now = Date.now();
      if (now - windowStarted > 10_000) {
        windowStarted = now;
        messages = 0;
      }
      if (++messages > 100) return webSocket.close(1008, "Rate limit exceeded");
      daemon.write(data.toString());
    });
    daemon.on("data", (chunk) => {
      buffer += decoder.write(chunk);
      if (Buffer.byteLength(buffer) > MAX_WIRE_MESSAGE_BYTES && !buffer.includes("\n"))
        return webSocket.close(1009, "Daemon message limit exceeded");
      for (let newline = buffer.indexOf("\n"); newline >= 0; newline = buffer.indexOf("\n")) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        if (
          Buffer.byteLength(line) > MAX_WIRE_MESSAGE_BYTES ||
          webSocket.bufferedAmount > 4 * 1024 * 1024
        )
          return webSocket.close(1009, "Attachment is too slow");
        webSocket.send(line);
      }
    });
    daemon.once("error", () => webSocket.close(1011, "Daemon connection failed"));
    daemon.once("close", close);
    webSocket.once("close", close);
    webSocket.once("error", close);
  });

  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolvePromise());
  });
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("Web gateway did not bind a TCP port");
  expectedHost = `127.0.0.1:${address.port}`;
  expectedOrigin = `http://${expectedHost}`;
  return {
    origin: `${expectedOrigin}${prefix}`,
    launchUrl: `${expectedOrigin}${prefix}#token=${launchToken.toString("base64url")}`,
    close: () =>
      new Promise((resolvePromise, reject) => {
        for (const ws of webSockets) ws.close(1001, "Gateway stopped");
        for (const socket of sockets) socket.destroy();
        wss.close();
        server.close((error) => (error ? reject(error) : resolvePromise()));
      }),
  };
}
