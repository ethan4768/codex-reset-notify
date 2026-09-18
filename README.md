# Codex Reset Notify

Cloudflare Worker，每 5 分钟读取 AIHOT 的 Codex Reset 数据，并在以下情况通过 Bark 推送：

- 首次出现或发生变化的非空 `schedule`
- 未来三天中某个具体日期的条件概率首次超过 50%

首次运行只建立历史 `schedule` 基线，不补发旧通知；若当前预测已经超过阈值，会立即通知。相同高概率日期只通知一次，概率跌回阈值以下后可再次触发。

## 工作方式

Worker 使用 KV 保存 API 的 `ETag`、最近快照、schedule 指纹和已通知的预测日期。即使 API 返回 `304 Not Modified`，仍会按当前时间重新计算概率，避免漏掉概率随时间跨过阈值的情况。

概率来自历史已确认的 `direct_reset` 间隔：排除短于当前已等待时间的间隔，将剩余间隔投影到最近三天。这是本项目的本地统计估算，不是 OpenAI 或 AIHOT 提供的保证。

## 部署

要求 Node.js 20+、Cloudflare 账号和 Bark App 中显示的推送 Key。

```bash
cd /Users/wangzhengkun/workspace/ethan4768/codex-reset-notify
npm install
npx wrangler login
npx wrangler secret put BARK_KEY
npm run deploy
```

输入 `BARK_KEY` 时只粘贴 Key，例如 Bark 地址是：

```text
https://api.day.app/xxxxxxxxxxxxxxxx/
```

则粘贴 `xxxxxxxxxxxxxxxx`，不要把 Key 写入代码或提交到 Git。

`STATE` KV 已创建并写入配置。Cron 使用 UTC，但 `*/5 * * * *` 只表示每 5 分钟，不受时区影响。

## 本地检查

```bash
npm test
npm run check
```

本地测试定时任务：

```bash
cp .dev.vars.example .dev.vars
npm run dev
curl http://localhost:8787/__scheduled
```

`.dev.vars` 内容：

```dotenv
BARK_KEY=你的_Bark_Key
```

## 配置

编辑 `wrangler.jsonc`：

- `PROBABILITY_THRESHOLD`：概率阈值，默认 `0.5`，判断条件为严格大于
- `triggers.crons`：检查频率，默认每 5 分钟
- `API_URL`：AIHOT 数据源

查看线上日志：

```bash
npm run tail
```

AIHOT 响应声明了使用条款和商业用途限制；如用于商业场景，请先按响应头中的联系信息取得授权。

## 当前部署状态

- Worker：`codex-reset-notify`
- KV：`codex-reset-notify-STATE`
- Secret：`BARK_KEY`
- Cron：`*/5 * * * *`
