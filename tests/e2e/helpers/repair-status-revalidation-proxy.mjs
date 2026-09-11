import http from "node:http";

const target = new URL(
  process.env.REPAIR_STATUS_PROXY_TARGET ?? "http://127.0.0.1:54321",
);
const port = Number(process.env.REPAIR_STATUS_PROXY_PORT ?? 54339);
if (
  target.protocol !== "http:" ||
  !["localhost", "127.0.0.1"].includes(target.hostname)
) {
  throw new Error("Repair status proxy is loopback-only.");
}
let repairId = null;
let blockReads = false;
let rejectUpdate = false;
let counts = {};
const held = [];
function resetCounts() {
  counts = {
    updates: 0,
    histories: 0,
    auditAttempts: 0,
    audits: 0,
    heldReads: 0,
    readPaths: [],
  };
}
resetCounts();
function release() {
  blockReads = false;
  for (const resume of held.splice(0)) resume();
}
function json(response, status, value) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (url.pathname.startsWith("/__qa/")) {
    if (request.method === "POST" && url.pathname === "/__qa/reset") {
      release();
      repairId = null;
      rejectUpdate = false;
      resetCounts();
    }
    if (request.method === "POST" && url.pathname === "/__qa/arm") {
      const id = url.searchParams.get("repair");
      if (!/^[0-9a-f-]{36}$/.test(id ?? ""))
        return json(response, 400, { error: "Invalid test repair" });
      repairId = id;
      rejectUpdate = url.searchParams.get("rejectUpdate") === "1";
    }
    if (request.method === "POST" && url.pathname === "/__qa/release")
      release();
    return json(response, 200, { blockReads, ...counts });
  }
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  let payload = null;
  try {
    payload = JSON.parse(body.toString());
  } catch {
    /* Reads have no JSON body. */
  }
  const update =
    repairId &&
    request.method === "PATCH" &&
    url.pathname === "/rest/v1/repairs" &&
    url.searchParams.get("id") === `eq.${repairId}`;
  const history =
    repairId &&
    request.method === "POST" &&
    url.pathname === "/rest/v1/repair_status_history" &&
    payload?.repair_id === repairId;
  const audit =
    repairId &&
    request.method === "POST" &&
    url.pathname === "/rest/v1/audit_logs" &&
    payload?.action === "repairs.status_changed" &&
    payload?.metadata?.repair_id === repairId;
  if (update && rejectUpdate)
    return json(response, 503, {
      code: "QA_UPDATE_ERROR",
      message: "Local injected no-write failure",
    });
  const forward = () => {
    if (response.destroyed) return;
    const upstream = http.request(
      target,
      {
        method: request.method,
        path: request.url,
        headers: { ...request.headers, host: target.host },
      },
      (result) => {
        response.writeHead(result.statusCode ?? 502, result.headers);
        result.on("end", () => {
          const success = result.statusCode >= 200 && result.statusCode < 300;
          if (update && success) counts.updates++;
          if (history && success) counts.histories++;
          if (audit) {
            counts.auditAttempts++;
            if (success) counts.audits++;
            blockReads = true;
          }
        });
        result.pipe(response);
      },
    );
    upstream.on("error", () => {
      if (!response.headersSent)
        json(response, 502, { error: "Local proxy upstream failed" });
      else response.destroy();
    });
    upstream.end(body);
  };
  if (
    blockReads &&
    ["GET", "HEAD"].includes(request.method) &&
    url.pathname.startsWith("/rest/v1/") &&
    !request.headers.origin
  ) {
    counts.heldReads++;
    counts.readPaths.push(url.pathname);
    held.push(forward);
  } else forward();
});
server.listen(port, "127.0.0.1", () =>
  console.log(`Repair status proxy on loopback ${port}`),
);
function shutdown() {
  release();
  server.close(() => process.exit(0));
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
