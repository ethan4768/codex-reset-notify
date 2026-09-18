import assert from "node:assert/strict";
import test from "node:test";

import {
  calculatePrediction,
  collectSchedules,
  findScheduleChanges,
  runCheck,
  validateSnapshot,
} from "../src/index.js";
import worker from "../src/index.js";

test("detects only new or changed non-empty schedules", () => {
  const before = collectSchedules([
    { id: "same", schedule: { label: "tomorrow" } },
    { id: "changed", schedule: { label: "morning" } },
  ]);
  const events = [
    { id: "same", schedule: { label: "tomorrow" } },
    { id: "changed", schedule: { label: "afternoon" } },
    { id: "new", schedule: { label: "tonight" } },
    { id: "empty", schedule: null },
  ];

  assert.deepEqual(
    findScheduleChanges(before, collectSchedules(events), events).map(({ id }) => id),
    ["changed", "new"],
  );
});

test("recalculates conditional probability from the current time", () => {
  const iso = (day) => `2026-01-${String(day).padStart(2, "0")}T00:00:00.000Z`;
  const snapshot = {
    checkedAt: iso(10),
    events: [1, 3, 5, 8, 10].map((day) => ({
      type: "direct_reset",
      status: "confirmed",
      confirmedAt: iso(day),
    })),
  };

  const prediction = calculatePrediction(snapshot, Date.parse(iso(11)));
  assert.equal(prediction.conditionalSampleCount, 4);
  assert.deepEqual(prediction.days, [
    { date: "2026-01-11", probability: 0 },
    { date: "2026-01-12", probability: 0.75 },
    { date: "2026-01-13", probability: 0.25 },
  ]);
});

test("rejects malformed upstream data", () => {
  assert.throws(() => validateSnapshot({ events: null }), /invalid snapshot/);
});

test("uses the cached snapshot after 304 and can still cross the alert threshold", async () => {
  const iso = (day) => `2026-01-${String(day).padStart(2, "0")}T00:00:00.000Z`;
  const snapshot = {
    checkedAt: iso(10),
    events: [1, 3, 5, 8, 10].map((day) => ({
      type: "direct_reset",
      status: "confirmed",
      confirmedAt: iso(day),
    })),
  };
  let saved;
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    if (String(url).includes("aihot.news")) return new Response(null, { status: 304 });
    return Response.json({ code: 200 });
  };

  try {
    const result = await runCheck(
      {
        API_URL: "https://aihot.news/api/v1/codex-resets",
        BARK_KEY: "test-key",
        PROBABILITY_THRESHOLD: "0.5",
        STATE: {
          get: async () => ({
            etag: "test-etag",
            schedules: {},
            predictionAlertKey: null,
            snapshot,
          }),
          put: async (_key, value) => {
            saved = JSON.parse(value);
          },
        },
      },
      Date.parse(iso(11)),
    );

    assert.equal(result.sourceChanged, false);
    assert.equal(result.predictionAlert, "2026-01-12");
    assert.equal(saved.predictionAlertKey, "2026-01-12");
    assert.equal(requests.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("renders cached status without fetching and escapes upstream text", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("status page must not fetch");
  };

  try {
    const response = await worker.fetch(new Request("https://example.com/"), {
      STATE: {
        get: async () => ({
          schedules: { one: "{}" },
          predictionAlertKey: null,
          snapshot: {
            checkedAt: "2026-01-10T00:00:00.000Z",
            events: [{ title: "<script>alert(1)</script>", schedule: { label: "今晚" } }],
          },
        }),
      },
    });
    const html = await response.text();

    assert.match(response.headers.get("content-type"), /text\/html/);
    assert.match(html, /Codex Reset/);
    assert.match(html, /href="https:\/\/aihot\.news\/codex-reset"/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>alert/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
