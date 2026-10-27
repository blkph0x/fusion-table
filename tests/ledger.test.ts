import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import test from "node:test";
import {
  MAX_LEDGER_BYTES, PostLimiter, ReportBodyError, emptyLedger, ledgerFile,
  readLedger, readReportJson, validPostDevice, withLedger, writeLedger,
} from "../lib/ledger.ts";

function temporaryBook() {
  const directory = mkdtempSync(join(tmpdir(), "fusion-ledger-"));
  return {
    directory,
    file: ledgerFile(directory),
    clean() {
      const resolved = resolve(directory);
      if (!resolved.startsWith(`${resolve(tmpdir())}${sep}fusion-ledger-`)) throw new Error("Unexpected temporary directory.");
      rmSync(resolved, { recursive: true, force: true });
    },
  };
}

test("queued ledger changes preserve every successful write and recover from a failed change", async () => {
  const book = temporaryBook();
  try {
    await Promise.all(Array.from({ length: 40 }, (_, n) => withLedger(book.file, (ledger) => ({
      ledger: { ...ledger, news: [...ledger.news, { id: `n${n}`, at: "2026-10-26", kind: "ask-why", plateKey: "test", title: "Test", text: "Test" }] },
      result: n,
    }))));
    assert.equal(readLedger(book.file).news.length, 40);
    const original = readFileSync(book.file, "utf8");
    await assert.rejects(withLedger(book.file, (ledger) => {
      ledger.news.length = 0;
      throw new Error("Interrupted update");
    }), /Interrupted update/);
    assert.equal(readFileSync(book.file, "utf8"), original);
    await withLedger(book.file, (ledger) => {
      ledger.news.push({ id: "after", at: "2026-10-26", kind: "restored", plateKey: "test", title: "Test", text: "Test" });
      return { ledger, result: true };
    });
    assert.equal(readLedger(book.file).news.length, 41);
    assert.deepEqual(readdirSync(book.directory), ["community-ledger.json"]);
  } finally { book.clean(); }
});

test("a malformed, wrong-shaped or oversized ledger is never replaced with an empty book", () => {
  const book = temporaryBook();
  try {
    assert.deepEqual(readLedger(book.file), emptyLedger());
    for (const raw of ["{", "[]", '{"votes":"corrupted"}', '{"prices":null}']) {
      writeFileSync(book.file, raw);
      assert.throws(() => readLedger(book.file), /Nothing was deleted/);
      assert.equal(readFileSync(book.file, "utf8"), raw);
    }
    writeFileSync(book.file, " ".repeat(MAX_LEDGER_BYTES + 1));
    assert.throws(() => readLedger(book.file), /Nothing was deleted/);
    assert.equal(readFileSync(book.file).byteLength, MAX_LEDGER_BYTES + 1);
    writeFileSync(book.file, '{"votes":[],"whys":[],"news":[]}');
    assert.deepEqual(readLedger(book.file), emptyLedger(), "older books without price arrays remain readable");
  } finally { book.clean(); }
});

test("the ledger cap counts UTF-8 bytes and an oversized update preserves the original", () => {
  const book = temporaryBook();
  try {
    writeLedger(emptyLedger(), book.file);
    const original = readFileSync(book.file, "utf8");
    const large = { ...emptyLedger(), padding: "😀".repeat(2_100_000) };
    assert.ok(JSON.stringify(large).length < MAX_LEDGER_BYTES);
    assert.throws(() => writeLedger(large, book.file), /book is full/);
    assert.equal(readFileSync(book.file, "utf8"), original);
    assert.deepEqual(readdirSync(book.directory), ["community-ledger.json"]);
  } finally { book.clean(); }
});

test("post quotas bound identities without evicting an active device quota", () => {
  let now = 100_000;
  const limiter = new PostLimiter({ now: () => now, maxDevices: 2, maxPerDevice: 2, maxTotal: 20 });
  assert.equal(limiter.allow("cookA"), true);
  assert.equal(limiter.allow("COOKA"), true);
  assert.equal(limiter.allow("cookA"), false);
  assert.equal(limiter.allow("cookB"), true);
  assert.equal(limiter.allow("cookC"), false, "a new identity cannot grow or evict the active map");
  assert.equal(limiter.allow("cookA"), false);
  now += 60_000;
  assert.equal(limiter.allow("cookC"), true, "expired identity entries are pruned");
  assert.equal(limiter.allow("cookA"), true);
});

test("rotating device strings cannot bypass the aggregate post backstop", () => {
  const limiter = new PostLimiter({ maxTotal: 3, maxPerDevice: 30 });
  assert.equal(limiter.allow("device1"), true);
  assert.equal(limiter.allow("device2"), true);
  assert.equal(limiter.allow("device3"), true);
  assert.equal(limiter.allow("device4"), false);
  for (const invalid of ["", "a".repeat(129), "cook\nother", "../cook"]) {
    assert.equal(validPostDevice(invalid), false);
    assert.equal(limiter.allow(invalid), false);
  }
});

function streamRequest(chunks: Uint8Array[], options: { length?: string; stalled?: boolean; cancel?: () => void } = {}) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      if (!options.stalled) controller.close();
    },
    cancel() { options.cancel?.(); },
  });
  return new Request("https://fusion.test/api/community", {
    method: "POST", body, duplex: "half",
    headers: options.length ? { "content-length": options.length } : undefined,
  } as RequestInit);
}

test("bounded JSON reads split Unicode correctly and rejects invalid JSON", async () => {
  const encoded = new TextEncoder().encode('{"note":"café 🍽️"}');
  const request = streamRequest(Array.from(encoded, (byte) => new Uint8Array([byte])));
  assert.deepEqual(await readReportJson(request), { note: "café 🍽️" });
  await assert.rejects(readReportJson(streamRequest([new TextEncoder().encode("{")])), SyntaxError);
});

test("report bodies enforce the byte cap with or without truthful Content-Length", async () => {
  let cancelled = false;
  await assert.rejects(readReportJson(streamRequest([], { length: "100", stalled: true, cancel: () => { cancelled = true; } }), { maxBytes: 10 }),
    (error: unknown) => error instanceof ReportBodyError && error.status === 413);
  assert.equal(cancelled, true, "oversized declared bodies are cancelled without waiting for bytes");
  for (const length of [undefined, "1"]) {
    const request = streamRequest([new TextEncoder().encode('{"note":"too large"}')], { length });
    await assert.rejects(readReportJson(request, { maxBytes: 10 }),
      (error: unknown) => error instanceof ReportBodyError && error.status === 413);
  }
});

test("stalled report streams have a deadline and cancel their underlying reader", async () => {
  let cancelled = false;
  const request = streamRequest([], { stalled: true, cancel: () => { cancelled = true; } });
  await assert.rejects(readReportJson(request, { timeoutMs: 10 }),
    (error: unknown) => error instanceof ReportBodyError && error.status === 408);
  assert.equal(cancelled, true);
});
