# LeadForge — free, local lead-gen tool for freelancing

**Goal:** find freelance-friendly leads from free public sources, score them against my
skills, manage the pitch pipeline, and never pay for anything. Runs 100% locally.

## Why these sources (all free, no API keys)

| Source | Endpoint | What we pull |
|---|---|---|
| Hacker News | `hn.algolia.com/api/v1` (free Algolia search) | Monthly **"Freelancer? Seeking Freelancer?"** thread (comments starting `SEEKING FREELANCER`) and **"Ask HN: Who is hiring?"** thread |
| Reddit r/forhire | `reddit.com/r/forhire/new.json` (public JSON) | Posts titled `[Hiring]` |
| RemoteOK | `remoteok.com/api` (public JSON) | Remote jobs, filtered to contract/dev-relevant |
| Remotive | `remotive.com/api/remote-jobs` (public JSON) | Remote software jobs |

Outreach is done from the user's own mailbox (copy button / `mailto:` link) — no paid
email service, no deliverability risk on our side.

## Architecture (MERN)

```
client (React + Vite + TS, port 5173)
   │  /api proxy
server (Express + TS, port 4100)
   ├── /api/scrape      → runs scrapers, normalizes, dedupes, scores, upserts
   ├── /api/leads       → CRUD + status transitions + notes + follow-ups
   ├── /api/templates   → pitch templates + render-for-lead
   ├── /api/settings    → my profile: name, skills/keywords, portfolio
   ├── /api/stats       → dashboard numbers
   └── /api/email/guess → email-pattern guesser + free DNS MX check
MongoDB 7 (docker compose, named volume — persistent, free)
```

### Lead lifecycle
`new → shortlisted → pitched → replied → won | lost` (+ `archived`).
Dedup key: `(source, sourceId)` unique index — re-scraping never duplicates.

### Scoring (0–100)
- keyword hits from Settings.keywords against title+description (weighted)
- freelance/contract signals (`freelance`, `contract`, `part-time`, `hourly`)
- budget/rate mentioned (regex `$`, `€`, `₹`, `/hr`, `k`)
- contact email present in post
- recency decay (fresh posts rank higher)

### Email guessing (free)
Given name + company domain: generate common patterns (`first@`, `first.last@`, …)
and validate the **domain** via DNS MX lookup (`node:dns`). No SMTP handshake —
port 25 is blocked on most residential networks; MX check is the honest free signal.

## Testing strategy
- **Unit** (vitest): scraper parsers against recorded fixtures (no network), scorer,
  email extractor, pattern guesser, template renderer.
- **Integration** (vitest + supertest + mongodb-memory-server): full API against a
  throwaway in-memory Mongo; scrape route with `fetch` stubbed to fixtures.
- **E2E smoke**: compose up Mongo → start server + client → live scrape → verify
  leads land and pipeline transitions work.

## Non-goals (v1)
Auto-sending email, LinkedIn scraping (ToS/legal), auth (single local user),
paid enrichment APIs.
