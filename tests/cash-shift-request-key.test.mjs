import test from "node:test";
import assert from "node:assert/strict";
import {
  confirmOperationRequestKey,
  confirmingOperationAction,
} from "../src/lib/hooks/use-operation-request-key.ts";
const store = new Map();
globalThis.sessionStorage = {
  getItem: (key) => store.get(key) ?? null,
  removeItem: (key) => store.delete(key),
};
function attempt(scope, key) {
  store.set("cash-operation-v2:" + scope, key);
  const data = new FormData();
  data.set("request_key", key);
  return data;
}
test("confirmed operation retires durable key before its form can unmount", async () => {
  const data = attempt("open", "original");
  const result = await confirmingOperationAction("open", async () => ({
    success: "Opened",
  }))({}, data);
  assert.equal(result.success, "Opened");
  assert.equal(store.has("cash-operation-v2:open"), false);
});
test("known failure and thrown unknown outcome both retain the same durable key", async () => {
  const data = attempt("payment", "unknown");
  await confirmingOperationAction("payment", async () => ({
    success: null,
    error: "Rejected",
  }))({}, data);
  assert.equal(store.get("cash-operation-v2:payment"), "unknown");
  await assert.rejects(
    confirmingOperationAction("payment", async () => {
      throw Error("Response lost");
    })({}, data),
  );
  assert.equal(store.get("cash-operation-v2:payment"), "unknown");
});
test("an older completion cannot retire a newer operation", () => {
  const old = attempt("return", "old");
  attempt("return", "new");
  confirmOperationRequestKey("return", old);
  assert.equal(store.get("cash-operation-v2:return"), "new");
});
