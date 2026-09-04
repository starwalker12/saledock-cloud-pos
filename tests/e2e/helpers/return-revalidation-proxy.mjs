import http from "node:http";

const listenPort = Number(process.env.RETURN_REVALIDATION_PROXY_PORT ?? 54329);
const target = new URL(
  process.env.RETURN_REVALIDATION_PROXY_TARGET ?? "http://127.0.0.1:54321",
);

let armed = false;
let blockReads = false;
let rpcCount = 0;
let heldReadCount = 0;
let heldReadPaths = [];
const heldReads = [];

function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

function status() {
  return {
    armed,
    blockReads,
    rpcCount,
    heldReadCount,
    heldReadPaths,
  };
}

function releaseHeldReads() {
  blockReads = false;
  for (const forward of heldReads.splice(0)) forward();
}

function forward(request, response) {
  const headers = { ...request.headers, host: target.host };
  const upstream = http.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      method: request.method,
      path: request.url,
      headers,
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);

      if (
        request.method === "POST" &&
        request.url?.startsWith("/rest/v1/rpc/create_invoice_return")
      ) {
        upstreamResponse.on("end", () => {
          rpcCount += 1;
          if (armed) blockReads = true;
        });
      }
    },
  );

  upstream.on("error", (error) => {
    if (!response.headersSent) {
      sendJson(response, 502, { error: error.message });
    } else {
      response.destroy(error);
    }
  });
  request.pipe(upstream);
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host}`);

  if (requestUrl.pathname === "/__qa/status") {
    sendJson(response, 200, status());
    return;
  }

  if (requestUrl.pathname === "/__qa/reset" && request.method === "POST") {
    releaseHeldReads();
    armed = false;
    rpcCount = 0;
    heldReadCount = 0;
    heldReadPaths = [];
    sendJson(response, 200, status());
    return;
  }

  if (requestUrl.pathname === "/__qa/arm" && request.method === "POST") {
    armed = true;
    sendJson(response, 200, status());
    return;
  }

  if (requestUrl.pathname === "/__qa/release" && request.method === "POST") {
    armed = false;
    releaseHeldReads();
    sendJson(response, 200, status());
    return;
  }

  const isServerRestRead =
    (request.method === "GET" || request.method === "HEAD") &&
    requestUrl.pathname.startsWith("/rest/v1/") &&
    !request.headers.origin;
  if (blockReads && isServerRestRead) {
    heldReadCount += 1;
    heldReadPaths.push(requestUrl.pathname);
    heldReads.push(() => forward(request, response));
    return;
  }

  forward(request, response);
});

server.listen(listenPort, "127.0.0.1", () => {
  process.stdout.write(
    `Return revalidation proxy listening on http://127.0.0.1:${listenPort}\n`,
  );
});

function shutdown() {
  releaseHeldReads();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
