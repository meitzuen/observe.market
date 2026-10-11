const test = require("node:test");
const assert = require("node:assert/strict");
const { loadJSON } = require("../../../docs/assets/data.js");

const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const notOk = (status) => ({ ok: false, status, json: async () => ({}) });

test("returns parsed JSON on success", async () => {
  const data = await loadJSON("x.json", { fetchImpl: async () => ok({ a: 1 }) });
  assert.deepEqual(data, { a: 1 });
});

test("retries once after a network failure then succeeds", async () => {
  let calls = 0;
  const data = await loadJSON("x.json", {
    retryDelay: 1,
    fetchImpl: async () => {
      calls++;
      if (calls === 1) throw new TypeError("network down");
      return ok([1, 2]);
    },
  });
  assert.equal(calls, 2);
  assert.deepEqual(data, [1, 2]);
});

test("throws after retries are exhausted", async () => {
  let calls = 0;
  await assert.rejects(
    loadJSON("x.json", {
      retries: 1,
      retryDelay: 1,
      fetchImpl: async () => {
        calls++;
        return notOk(503);
      },
    }),
    (e) => e.status === 503,
  );
  assert.equal(calls, 2);
});

test("does not retry a 404", async () => {
  let calls = 0;
  await assert.rejects(
    loadJSON("missing.json", {
      retryDelay: 1,
      fetchImpl: async () => {
        calls++;
        return notOk(404);
      },
    }),
    (e) => e.status === 404,
  );
  assert.equal(calls, 1);
});

test("aborts when the request exceeds the timeout", async () => {
  const hang = (url, init) =>
    new Promise((_, reject) => {
      init.signal.addEventListener("abort", () =>
        reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
      );
    });
  await assert.rejects(
    loadJSON("slow.json", { timeout: 20, retries: 0, fetchImpl: hang }),
    (e) => e.name === "AbortError",
  );
});

test("rejects when the body is not valid JSON", async () => {
  await assert.rejects(
    loadJSON("bad.json", {
      retries: 0,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token <");
        },
      }),
    }),
    SyntaxError,
  );
});
