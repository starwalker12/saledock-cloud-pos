import http from "node:http";

const target = new URL(process.env.REPAIR_SAVE_PROXY_TARGET ?? "http://127.0.0.1:54321");
const port = Number(process.env.REPAIR_SAVE_PROXY_PORT ?? 54341);
if (target.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(target.hostname)) {
  throw new Error("Repair save proxy is loopback-only");
}
let marker = null, repairId = null, rejectWrite = false, blockReads = false;
let counts;
const held = [];
function resetCounts() {
  counts = { inserts: 0, updates: 0, histories: 0, historyAttempts: 0, audits: 0, auditAttempts: 0, heldReads: 0, readPaths: [] };
}
function release() {
  blockReads = false;
  for (const resume of held.splice(0)) resume();
}
function json(response, status, value) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}
resetCounts();
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (url.pathname.startsWith("/__qa/")) {
    if (request.method === "POST" && url.pathname === "/__qa/reset") {
      release(); marker = null; repairId = null; rejectWrite = false; resetCounts();
    }
    if (request.method === "POST" && url.pathname === "/__qa/arm") {
      const value = url.searchParams.get("marker");
      if (!/^QA-SAVE-[0-9a-f-]{36}$/.test(value ?? "")) return json(response, 400, { error: "Invalid marker" });
      marker = value;
      repairId = url.searchParams.get("repair");
      if (repairId && !/^[0-9a-f-]{36}$/.test(repairId)) return json(response, 400, { error: "Invalid repair" });
      rejectWrite = url.searchParams.get("rejectWrite") === "1";
    }
    if (request.method === "POST" && url.pathname === "/__qa/release") release();
    return json(response, 200, { blockReads, repairId, ...counts });
  }
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  let payload;
  try { payload = JSON.parse(body.toString()); } catch { /* Reads have no body. */ }
  const insert = marker && request.method === "POST" && url.pathname === "/rest/v1/repairs" && payload?.customer_name === marker;
  const update = marker && request.method === "PATCH" && url.pathname === "/rest/v1/repairs" && payload?.customer_name === marker && url.searchParams.get("id") === `eq.${repairId}`;
  const history = marker && request.method === "POST" && url.pathname === "/rest/v1/repair_status_history" && payload?.repair_id === repairId;
  const audit = marker && request.method === "POST" && url.pathname === "/rest/v1/audit_logs" && ["repairs.created", "repairs.updated"].includes(payload?.action) && payload?.metadata?.repair_id === repairId;
  if (rejectWrite && (insert || update)) return json(response, 503, { code: "QA_WRITE_ERROR", message: "Local injected no-write failure" });
  const forward = () => {
    if (response.destroyed) return;
    const upstream = http.request(target, { method: request.method, path: request.url, headers: { ...request.headers, host: target.host } }, result => {
      const resultChunks = [];
      result.on("data", chunk => resultChunks.push(chunk));
      result.on("end", () => {
        const success = result.statusCode >= 200 && result.statusCode < 300;
        if (insert && success) {
          counts.inserts++;
          const value = JSON.parse(Buffer.concat(resultChunks).toString());
          repairId = (Array.isArray(value) ? value[0] : value).id;
        }
        if (update && success) counts.updates++;
        if (history) {
          counts.historyAttempts++;
          if (success) counts.histories++;
          else blockReads = true;
        }
        if (audit) {
          counts.auditAttempts++;
          if (success) counts.audits++;
          blockReads = true;
        }
      });
      response.writeHead(result.statusCode ?? 502, result.headers);
      result.pipe(response);
    });
    upstream.on("error", () => {
      if (!response.headersSent) json(response, 502, { error: "Local proxy upstream failed" });
      else response.destroy();
    });
    upstream.end(body);
  };
  if (blockReads && ["GET", "HEAD"].includes(request.method) && url.pathname.startsWith("/rest/v1/") && !request.headers.origin) {
    counts.heldReads++;
    counts.readPaths.push(url.pathname);
    held.push(forward);
  } else forward();
});
server.listen(port, "127.0.0.1", () => console.log(`Repair save proxy on loopback ${port}`));
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => { release(); server.close(() => process.exit(0)); });
