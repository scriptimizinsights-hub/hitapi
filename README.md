# ⚡ APIForge — AI-Powered API Testing on Cloudflare

Test every endpoint automatically. Import a Swagger spec, let Cloudflare Workers AI generate test cases, run them, and get AI-analyzed bug reports — all in one platform.

---

## Architecture

```
Frontend (React + Vite)          Backend (Cloudflare Worker)
┌─────────────────────┐          ┌──────────────────────────────┐
│  React SPA          │  fetch   │  itty-router Worker          │
│  Zustand store      │ ──────►  │  /api/*                      │
│  Recharts           │          │                              │
│  Cloudflare Pages   │          │  ┌─────────────────────────┐ │
└─────────────────────┘          │  │ Cloudflare Services      │ │
                                 │  │  D1 (SQLite DB)          │ │
                                 │  │  KV (cache layer)        │ │
                                 │  │  R2 (report storage)     │ │
                                 │  │  Queues (async exec)     │ │
                                 │  │  Workers AI (LLaMA 3.1)  │ │
                                 │  └─────────────────────────┘ │
                                 └──────────────────────────────┘
```

### DB is swappable
`worker/src/db/adapter.js` wraps D1 behind a consistent interface (`all`, `first`, `run`, `batch`). Swap to PostgreSQL/MySQL by replacing that file — nothing else changes.

---

## Quick Start

### 1. Prerequisites
- [Node.js 18+](https://nodejs.org)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/): `npm i -g wrangler`
- Cloudflare account (free tier works)

### 2. Install

```bash
git clone <repo>
cd apiforge
npm run install:all
```

### 3. Create Cloudflare resources

```bash
# D1 database
wrangler d1 create apiforge-db

# KV namespace
wrangler kv:namespace create CACHE

# R2 bucket
wrangler r2 bucket create apiforge-reports

# Queue
wrangler queues create apiforge-test-queue
```

Copy the IDs into `worker/wrangler.toml`.

### 4. Run migrations

```bash
npm run db:migrate:local --workspace=worker
```

### 5. Start dev servers

```bash
npm run dev
# Frontend: http://localhost:5173
# Worker:   http://localhost:8787
```

---

## Deployment

### Deploy to Cloudflare (recommended)

```bash
# Deploy worker first
npm run deploy --workspace=worker

# Deploy frontend to Cloudflare Pages
npm run deploy --workspace=frontend
```

### Deploy worker to any platform

The worker uses only Web standard APIs (`fetch`, `Request`, `Response`, `crypto`).
To run on Node.js / Bun / Deno, provide compatible bindings:

```js
// node-adapter.js (example for Node.js 18+)
import worker from './worker/src/index.js';

const env = {
  DB: yourD1OrPgAdapter,   // implement: all(), first(), run(), batch()
  CACHE: yourKVAdapter,     // implement: get(), put(), delete()
  REPORTS: yourR2Adapter,   // implement: put(), get()
  TEST_QUEUE: yourQueue,    // implement: send()
  AI: yourAIAdapter,        // implement: run(model, options)
  CORS_ORIGIN: '*'
};

// Wrap as HTTP server
import { createServer } from 'http';
createServer(async (req, res) => {
  const request = new Request(`http://localhost${req.url}`, { method: req.method, headers: req.headers });
  const response = await worker.fetch(request, env, {});
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(await response.text());
}).listen(8787);
```

---

## Features

| Module | Status | Cloudflare Service |
|---|---|---|
| Project management | ✅ | D1 |
| Swagger import (OpenAPI 3.0/3.1/2.0) | ✅ | KV (cache) |
| Endpoint discovery | ✅ | D1 |
| AI test generation | ✅ | Workers AI (LLaMA 3.1) |
| Test execution (parallel) | ✅ | — |
| AI bug detection | ✅ | Workers AI |
| HTML/JSON/CSV reports | ✅ | R2 |
| Async execution via queue | ✅ | Queues |
| Scheduled monitoring | ✅ | Cron Triggers |
| Response schema validation | ✅ | — |
| Auth support (Bearer/Basic/API Key) | ✅ | — |
| CI/CD webhook | 🔜 | — |
| Self-healing tests | 🔜 | — |

---

## API Reference

```
GET    /health
GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
PUT    /api/projects/:id
DELETE /api/projects/:id
POST   /api/projects/:id/import          # Import Swagger spec
GET    /api/projects/:id/endpoints       # List endpoints
POST   /api/projects/:id/generate        # AI test generation
GET    /api/projects/:id/tests           # List test cases
POST   /api/projects/:id/run             # Execute tests
GET    /api/projects/:id/executions      # Execution history
GET    /api/projects/:id/executions/:id  # Execution details + results
GET    /api/projects/:id/bugs            # AI-detected bugs
DELETE /api/projects/:id/bugs/:id        # Dismiss bug
GET    /api/projects/:id/workflows       # AI workflow detection
GET    /api/projects/:id/reports         # Report list
GET    /api/reports/:id/download         # Download from R2
```

---

## Environment Variables

### Worker (`wrangler.toml`)
| Variable | Purpose |
|---|---|
| `CORS_ORIGIN` | Allowed frontend origin |
| `ENVIRONMENT` | `development` or `production` |

### Frontend (`.env`)
| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Worker URL (default: `/api` via Vite proxy) |

---

## CI/CD (GitHub Actions)

```yaml
# .github/workflows/deploy.yml
name: Deploy APIForge
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm run install:all
      - run: npm run build
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
      - run: npm run deploy --workspace=worker
      - run: npm run deploy --workspace=frontend
```

---

## Project Structure

```
apiforge/
├── package.json                    # Monorepo root
├── worker/
│   ├── wrangler.toml               # Cloudflare config
│   ├── migrations/
│   │   └── 0001_initial.sql        # D1 schema
│   └── src/
│       ├── index.js                # Worker entry point + router
│       ├── db/adapter.js           # DB abstraction (swap here for non-CF)
│       ├── middleware/cors.js       # CORS + helpers
│       ├── routes/index.js          # All route handlers
│       └── services/
│           ├── ai.js               # Cloudflare Workers AI
│           ├── swagger.js          # OpenAPI parser
│           ├── executor.js         # Test runner
│           └── reports.js          # R2 report generator
└── frontend/
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx                 # Router + layout
        ├── store/index.js          # Zustand + API client
        ├── styles/global.css       # Design system
        └── components/
            ├── layout/Sidebar.jsx
            ├── dashboard/Dashboard.jsx
            ├── endpoints/EndpointsPage.jsx
            ├── tests/TestsPage.jsx
            └── ui/Pages.jsx        # Bugs, Reports, Modals, Toasts
```
