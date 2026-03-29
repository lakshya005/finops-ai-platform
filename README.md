# FinOps AI — Agentic Cost Observability Platform

> **Know exactly what you're spending on AI. Down to the cent, per model, per request.**

---

## What is this?

Every time your application calls an AI model — OpenAI's GPT-4o, Anthropic's Claude, or others — it costs money. Those costs are invisible by default. You get a monthly bill from OpenAI with a single number, and you have no idea which feature, which user, or which model drove that cost.

**FinOps AI fixes that.**

It sits invisibly between your application and the AI providers. Every API call passes through it, gets measured, priced, and recorded — in real time, with zero changes to how your application works. You get a live dashboard showing exactly where your AI budget is going.

---

## What it looks like

```
Your App  →  FinOps Proxy  →  OpenAI / Anthropic
                ↓
          Cost captured
                ↓
          Dashboard shows:
          • $23.40 spent this month
          • 4,579 requests
          • Top model: claude-3-5-sonnet
          • Spend trend over time
```

---

## Who is this for?

| If you are... | This helps you... |
|---|---|
| A developer using AI APIs | See your real costs broken down by model and day |
| A startup building AI features | Track which features cost the most |
| An engineering team | Set up cost visibility before the bill surprises you |
| A portfolio reviewer | See a full-stack observability system built from scratch |

---

## Features

- **Real-time cost tracking** — every AI request is captured and priced instantly
- **Multi-provider support** — OpenAI and Anthropic in one dashboard
- **Per-model breakdown** — see exactly which model is costing what
- **Spend over time** — 7-day and 30-day trend charts
- **Secure by design** — your real API keys never leave the proxy
- **Organization-aware** — supports multiple teams or projects under one platform

---

## Architecture — How it works

The platform has five layers, each with a specific job:

```
┌─────────────────────────────────────────────────────────────┐
│                        Your Application                      │
│              (sends AI requests as normal)                   │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   Cloudflare Worker (Proxy)                  │
│  • Intercepts every request                                  │
│  • Identifies the model being called                         │
│  • Forwards to OpenAI / Anthropic                            │
│  • Extracts token counts from the response                   │
│  • Calculates cost using live pricing matrix                 │
│  • Fires cost event to the pipeline (non-blocking)           │
└─────────────────────┬───────────────────────────────────────┘
                      │  fire-and-forget
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                      AWS Pipeline                            │
│  SQS Queue  →  Lambda Function  →  ClickHouse               │
│  (buffer)      (transform)         (store)                   │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   ClickHouse Database                        │
│  • Columnar analytics database                               │
│  • Optimised for aggregation queries                         │
│  • Stores every cost_event with full metadata                │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   Next.js Dashboard                          │
│  • Supabase authentication (login required)                  │
│  • KPI cards: total spend, requests, top provider            │
│  • Spend-over-time line chart                                │
│  • Cost breakdown table by model                             │
└─────────────────────────────────────────────────────────────┘
```

### Key design decisions

**Why Cloudflare Workers for the proxy?**
Workers run at the edge — geographically close to your users — with sub-millisecond cold starts. The proxy adds zero meaningful latency to your AI calls.

**Why fire-and-forget for cost events?**
The proxy never delays your AI response to wait for the cost pipeline. The event is sent asynchronously. If the pipeline is slow or down, your application never notices.

**Why ClickHouse for storage?**
ClickHouse is a columnar database built for analytics. A query like "total spend by model over 30 days" runs in milliseconds even over millions of rows — something a regular database like Postgres would struggle with at scale.

**Why SQS between the proxy and Lambda?**
SQS acts as a buffer. If Lambda is busy or temporarily unavailable, events queue up and are processed in order. No data is lost.

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Proxy | Cloudflare Workers (TypeScript) | Edge runtime, zero cold start |
| Queue | AWS SQS | Decouples proxy from pipeline |
| Pipeline | AWS Lambda (Python 3.12) | Serverless, scales to zero |
| Database | ClickHouse | Columnar, built for analytics |
| Frontend | Next.js 14 + Tailwind CSS | App Router, server components |
| Auth | Supabase | Managed JWT auth |
| Infra | AWS (SQS, Lambda, IAM) | Production-grade pipeline |

---

## Repository Structure

```
finops-ai-platform/
│
├── proxy/                      # Cloudflare Worker
│   └── src/
│       ├── interceptor.ts      # Parses and enriches incoming requests
│       ├── tokenExtractor.ts   # Pulls token counts from AI responses
│       ├── pricing.ts          # Pricing matrix for all supported models
│       ├── sqsEmitter.ts       # Sends cost events to AWS SQS
│       └── responseHandler.ts  # Orchestrates the full proxy flow
│
├── pipeline/                   # AWS data pipeline
│   └── lambda/
│       └── handler.py          # SQS → ClickHouse writer
│
├── frontend/                   # Next.js dashboard
│   ├── app/
│   │   ├── login/              # Auth page
│   │   ├── dashboard/          # Main dashboard (protected)
│   │   └── api/
│   │       └── costs/          # ClickHouse query API routes
│   ├── lib/
│   │   ├── supabase/           # Auth clients (browser + server)
│   │   └── clickhouse.ts       # ClickHouse singleton client
│   ├── middleware.ts            # Route protection
│   └── scripts/
│       └── seed-clickhouse.ts  # Dev data seeder
│
├── sdk/                        # (Phase 5) npm + Python packages
└── docs/                       # Architecture diagrams and notes
```

---

## Data Model

Every AI request produces one `cost_event` row:

```sql
CREATE TABLE cost_events (
    request_id    String,       -- unique ID per request
    org_id        String,       -- which team/project
    provider      String,       -- "openai" or "anthropic"
    model         String,       -- e.g. "gpt-4o-mini"
    input_tokens  UInt32,       -- tokens sent to the model
    output_tokens UInt32,       -- tokens received back
    cost_usd      Float64,      -- calculated cost in USD
    timestamp_ms  Int64,        -- when the request happened
    duration_ms   UInt32        -- how long the request took
) ENGINE = ReplacingMergeTree()
ORDER BY request_id;
```

---

## Supported Models and Pricing

| Provider | Model | Input (per 1M tokens) | Output (per 1M tokens) |
|---|---|---|---|
| OpenAI | gpt-4o | $2.50 | $10.00 |
| OpenAI | gpt-4o-mini | $0.15 | $0.60 |
| Anthropic | claude-3-5-sonnet | $3.00 | $15.00 |
| Anthropic | claude-3-5-haiku | $1.00 | $5.00 |
| Anthropic | claude-3-opus | $15.00 | $75.00 |

*Pricing verified March 2026. The pricing matrix is bundled in the Worker at deploy time.*

---

## Development Setup

### Prerequisites

- Node.js 18+
- Docker Desktop (for ClickHouse)
- AWS account (for SQS + Lambda)
- Cloudflare account (for Workers)
- Supabase account (free tier works)

### 1. Clone the repo

```bash
git clone https://github.com/lakshya005/finops-ai-platform
cd finops-ai-platform
```

### 2. Start ClickHouse

```bash
docker start clickhouse
# verify it's running:
curl http://localhost:8123/ping   # should return: Ok.
```

### 3. Set up the frontend

```bash
cd frontend
cp .env.local.example .env.local
# fill in: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
#          CLICKHOUSE_HOST, CLICKHOUSE_USER, CLICKHOUSE_PASSWORD
npm install
npm run dev
```

### 4. Seed mock data (optional)

```bash
npx ts-node scripts/seed-clickhouse.ts
# inserts 30 days of realistic cost data across 4 models
```

### 5. Deploy the proxy

```bash
cd proxy
npx wrangler deploy
```

---

## Build Phases

This platform was built in phases, each independently testable:

| Phase | What was built | Status |
|---|---|---|
| Phase 1 | Repo setup, Worker deployed, ClickHouse table created | ✅ Complete |
| Phase 2 | Proxy core — request interception, token extraction, cost calculation | ✅ Complete |
| Phase 3 | Pipeline activation — SQS queue, Lambda writer, end-to-end smoke test | ✅ Complete |
| Phase 4 | Frontend — auth, API routes, dashboard UI, mock data | ✅ Complete |
| Phase 5 | SDK — npm + Python packages for easy integration | 🔄 In progress |

---

## Going to Production

This platform is built for local dev but the path to production is clear:

- **Proxy**: already live on Cloudflare's global edge network
- **Pipeline**: swap local Docker ClickHouse for ClickHouse Cloud; SQS and Lambda are already AWS-hosted
- **Frontend**: deploy to Vercel with one command (`vercel deploy`)
- **Pricing matrix**: move from bundled Worker code to Workers KV for live updates without redeployment

---

## About

Built by **Lakshya Gupta** — M.S. Computer Science, Indiana University (May 2026).

AWS Certified Solutions Architect | Cloud Practitioner | AI Practitioner

This project demonstrates end-to-end ownership of a production-grade platform: edge computing, async event pipelines, columnar analytics, and modern full-stack development.

[GitHub](https://github.com/lakshya005/finops-ai-platform)