const STATE_KEY = "codex-reset-notify-state";
const DAY = 86_400_000;
const BEIJING_OFFSET = 8 * 60 * 60 * 1000;

export default {
  async scheduled(_controller, env) {
    await runCheck(env);
  },

  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/health") {
      return Response.json({ ok: true, service: "codex-reset-notify" });
    }
    if (pathname !== "/") return new Response("Not Found", { status: 404 });

    const state = await env.STATE.get(STATE_KEY, "json");
    return new Response(renderStatusPage(state), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
};

export function renderStatusPage(state, now = Date.now()) {
  const prediction = state?.snapshot ? calculatePrediction(state.snapshot, now) : null;
  const recentSchedules = (state?.snapshot?.events ?? [])
    .filter((event) => event?.schedule)
    .slice(0, 3);
  const latestReset = prediction?.latestReset;
  const checkedAt = state?.snapshot?.checkedAt;
  const ready = Boolean(state?.snapshot);
  const probabilityCards = prediction
    ? prediction.days
        .map((day) => {
          const value = Math.round(day.probability * 100);
          return `<article class="day"><span>${escapeHtml(day.date.slice(5))}</span><strong>${value}%</strong><div class="bar"><i style="width:${value}%"></i></div></article>`;
        })
        .join("")
    : '<p class="muted">历史样本暂不足以生成预测。</p>';
  const scheduleRows = recentSchedules.length
    ? recentSchedules
        .map(
          (event) => `<li><span>${escapeHtml(event.title || "Codex Reset")}</span><strong>${escapeHtml(event.schedule?.label || stableStringify(event.schedule))}</strong></li>`,
        )
        .join("")
    : '<li class="muted">暂无 Schedule</li>';

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Codex Reset Notify</title><style>
:root{color-scheme:dark;--bg:#0b1520;--panel:#111f2c;--line:#294154;--text:#e9f1f5;--muted:#8ea4b4;--signal:#64dcb8;--warn:#ffd166}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 70% 0,#17354b 0,transparent 38%),var(--bg);color:var(--text);font:15px/1.5 ui-sans-serif,system-ui,sans-serif}main{width:min(920px,calc(100% - 32px));margin:auto;padding:48px 0 64px}header{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:32px}.eyebrow,.label{color:var(--muted);font:12px ui-monospace,SFMono-Regular,monospace;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(32px,7vw,64px);line-height:1;margin:8px 0 0;letter-spacing:-.05em}.source{display:inline-block;margin-top:18px;color:var(--bg);background:var(--signal);border-radius:999px;padding:8px 13px;font-weight:700;text-decoration:none}.source:hover{filter:brightness(1.12)}.source:focus-visible{outline:3px solid var(--warn);outline-offset:3px}.status{display:flex;align-items:center;gap:9px;border:1px solid var(--line);border-radius:999px;padding:8px 13px;white-space:nowrap}.dot{width:8px;height:8px;border-radius:50%;background:${ready ? "var(--signal)" : "var(--warn)"};box-shadow:0 0 18px currentColor}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.panel{background:color-mix(in srgb,var(--panel) 88%,transparent);border:1px solid var(--line);border-radius:16px;padding:20px}.hero{grid-column:span 2}.metric{font:600 22px ui-monospace,SFMono-Regular,monospace;margin-top:8px}.muted{color:var(--muted)}h2{font-size:16px;margin:0 0 18px}.days{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.day{border-left:1px solid var(--line);padding-left:14px}.day span{color:var(--muted)}.day strong{display:block;font:600 28px ui-monospace,SFMono-Regular,monospace;margin:5px 0}.bar{height:3px;background:var(--line)}.bar i{display:block;height:100%;background:var(--signal)}ul{list-style:none;padding:0;margin:0}li{display:flex;justify-content:space-between;gap:20px;padding:12px 0;border-top:1px solid var(--line)}li:first-child{border-top:0}li strong{text-align:right;font-family:ui-monospace,SFMono-Regular,monospace}footer{color:var(--muted);font-size:12px;margin-top:18px}@media(max-width:680px){main{padding-top:28px}header{display:block}.status{width:max-content;margin-top:20px}.grid{grid-template-columns:1fr}.hero{grid-column:auto}.days{grid-template-columns:1fr}.day{padding:10px 0 10px 14px}}
</style></head><body><main>
<header><div><div class="eyebrow">Reset radar / Beijing time</div><h1>Codex Reset<br>Notify</h1><a class="source" href="https://aihot.news/codex-reset" target="_blank" rel="noopener noreferrer">数据来源：AIHOT ↗</a></div><div class="status"><i class="dot"></i>${ready ? "监控运行中" : "等待首次巡检"}</div></header>
<section class="grid">
<div class="panel hero"><h2>未来三天概率</h2><div class="days">${probabilityCards}</div></div>
<div class="panel"><div class="label">当前预测告警</div><div class="metric">${escapeHtml(state?.predictionAlertKey || "未触发")}</div></div>
<div class="panel"><div class="label">最新确认重置</div><div class="metric">${formatBeijing(latestReset)}</div></div>
<div class="panel"><div class="label">数据核验时间</div><div class="metric">${formatBeijing(checkedAt)}</div></div>
<div class="panel"><div class="label">已追踪 Schedule</div><div class="metric">${Object.keys(state?.schedules ?? {}).length}</div></div>
<div class="panel hero"><h2>最近 Schedule</h2><ul>${scheduleRows}</ul></div>
<div class="panel"><div class="label">检查频率</div><div class="metric">每 5 分钟</div><p class="muted">访问本页不会触发检查或推送。</p></div>
</section><footer>页面生成 ${formatBeijing(now)}</footer>
</main></body></html>`;
}

function formatBeijing(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );
}

export async function runCheck(env, now = Date.now()) {
  const oldState = await env.STATE.get(STATE_KEY, "json");
  const { snapshot, etag, changed } = await fetchSnapshot(env.API_URL, oldState);
  const schedules = collectSchedules(snapshot.events);
  const scheduleChanges = oldState
    ? findScheduleChanges(oldState.schedules ?? {}, schedules, snapshot.events)
    : [];
  const prediction = calculatePrediction(snapshot, now);
  const threshold = readThreshold(env.PROBABILITY_THRESHOLD);
  const high = prediction?.days.find((day) => day.probability > threshold) ?? null;
  const predictionAlertKey = high?.date ?? null;
  const shouldNotifyPrediction = Boolean(
    high && oldState?.predictionAlertKey !== predictionAlertKey,
  );

  if (scheduleChanges.length || shouldNotifyPrediction) {
    await sendNotification(
      env.BARK_KEY,
      buildNotification(scheduleChanges, prediction, shouldNotifyPrediction ? high : null),
    );
  }

  if (changed || !oldState || oldState.predictionAlertKey !== predictionAlertKey) {
    await env.STATE.put(
      STATE_KEY,
      JSON.stringify({
        version: 1,
        etag,
        schedules,
        predictionAlertKey,
        snapshot,
      }),
    );
  }

  const result = {
    ok: true,
    sourceChanged: changed,
    scheduleChanges: scheduleChanges.length,
    predictionAlert: shouldNotifyPrediction ? predictionAlertKey : null,
  };
  console.log(JSON.stringify({ event: "codex-reset-check", ...result }));
  return result;
}

async function fetchSnapshot(apiUrl, oldState) {
  const headers = {
    Accept: "application/json",
    "User-Agent": "codex-reset-notify/1.0",
  };
  if (oldState?.etag) headers["If-None-Match"] = oldState.etag;

  let response = await fetch(apiUrl, { headers });
  if (response.status === 304 && oldState?.snapshot) {
    return { snapshot: oldState.snapshot, etag: oldState.etag, changed: false };
  }
  if (response.status === 304) {
    response = await fetch(apiUrl, { headers: { Accept: "application/json" } });
  }
  if (!response.ok) {
    throw new Error(`AIHOT API request failed: ${response.status}`);
  }

  const snapshot = validateSnapshot(await response.json());
  return {
    snapshot,
    etag: response.headers.get("ETag"),
    changed: true,
  };
}

export function validateSnapshot(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.events)) {
    throw new Error("AIHOT API returned an invalid snapshot");
  }
  return value;
}

export function collectSchedules(events) {
  return Object.fromEntries(
    events
      .filter((event) => event && typeof event === "object" && event.schedule)
      .map((event) => [eventKey(event), stableStringify(event.schedule)]),
  );
}

export function findScheduleChanges(previous, current, events) {
  return events.filter((event) => {
    if (!event || typeof event !== "object" || !event.schedule) return false;
    const key = eventKey(event);
    return previous[key] !== current[key];
  });
}

export function calculatePrediction(snapshot, now = Date.now()) {
  const resets = [
    ...new Set(
      snapshot.events
        .filter(
          (event) =>
            event?.type === "direct_reset" &&
            event.status === "confirmed" &&
            event.confirmedAt,
        )
        .map((event) => Date.parse(event.confirmedAt))
        .filter(Number.isFinite),
    ),
  ].sort((a, b) => a - b);

  if (resets.length < 3) return null;

  const intervals = resets.slice(1).map((reset, index) => reset - resets[index]);
  const latestReset = resets.at(-1);
  const elapsed = Math.max(0, now - latestReset);
  const survivingIntervals = intervals.filter((interval) => interval > elapsed);
  if (!survivingIntervals.length) return null;

  const dayKeys = nextBeijingDays(now, 3);
  const counts = Object.fromEntries(dayKeys.map((date) => [date, 0]));
  let later = 0;

  for (const interval of survivingIntervals) {
    const date = beijingDate(latestReset + interval);
    if (Object.hasOwn(counts, date)) counts[date] += 1;
    else later += 1;
  }

  const total = survivingIntervals.length;
  return {
    checkedAt: snapshot.checkedAt ?? null,
    calculatedAt: new Date(now).toISOString(),
    latestReset: new Date(latestReset).toISOString(),
    historicalResetCount: resets.length,
    intervalSampleCount: intervals.length,
    conditionalSampleCount: total,
    days: dayKeys.map((date) => ({
      date,
      probability: counts[date] / total,
    })),
    laterProbability: later / total,
  };
}

function buildNotification(scheduleChanges, prediction, high) {
  const sections = [];

  if (scheduleChanges.length) {
    sections.push(
      scheduleChanges
        .map((event) => {
          const post = event.posts?.[0];
          return [
            `⏰ ${event.title || "Codex Reset schedule 更新"}`,
            event.schedule?.label || stableStringify(event.schedule),
            `状态：${event.status || "-"}`,
            post?.url || event.url,
          ]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n\n"),
    );
  }

  if (high && prediction) {
    sections.push(
      [
        `🔥 高概率日期：${high.date}`,
        `概率：${percent(high.probability)}`,
        "",
        ...prediction.days.map((day) => `${day.date}：${percent(day.probability)}`),
        `更晚：${percent(prediction.laterProbability)}`,
        `条件样本：${prediction.conditionalSampleCount}`,
      ].join("\n"),
    );
  }

  return {
    title:
      scheduleChanges.length && high
        ? "Codex Reset 新动态与预测"
        : scheduleChanges.length
          ? "Codex Reset 新 Schedule"
          : `Codex Reset 预测 ${percent(high.probability)}`,
    body: sections.join("\n\n"),
  };
}

async function sendNotification(deviceKey, notification) {
  if (!deviceKey) throw new Error("BARK_KEY is not configured");

  const response = await fetch("https://api.day.app/push", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      device_key: deviceKey,
      ...notification,
      group: "Codex Reset",
      icon: "https://aihot.news/favicon.ico",
      url: "https://aihot.news/codex-reset",
    }),
  });
  if (!response.ok) throw new Error(`Bark push failed: ${response.status}`);

  const result = await response.json();
  if (result?.code !== 200) {
    throw new Error(`Bark push failed: ${result?.message || "unknown error"}`);
  }
}

function readThreshold(value) {
  const threshold = Number(value ?? "0.5");
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error("PROBABILITY_THRESHOLD must be between 0 and 1");
  }
  return threshold;
}

function eventKey(event) {
  return String(
    event.id ||
      [event.type, event.createdAt, event.posts?.[0]?.url].filter(Boolean).join("|"),
  );
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

function nextBeijingDays(timestamp, count) {
  const start = new Date(timestamp + BEIJING_OFFSET);
  start.setUTCHours(0, 0, 0, 0);
  return Array.from({ length: count }, (_, index) =>
    new Date(start.getTime() + index * DAY).toISOString().slice(0, 10),
  );
}

function beijingDate(timestamp) {
  return new Date(timestamp + BEIJING_OFFSET).toISOString().slice(0, 10);
}

function percent(value) {
  return `${Math.round(value * 100)}%`;
}
