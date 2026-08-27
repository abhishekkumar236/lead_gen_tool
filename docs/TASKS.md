# Task board — all complete

## Phase 0 — Foundation
- [x] T0.1 docker-compose.yml with mongo:7 + persistent volume
- [x] T0.2 server scaffold: package.json, tsconfig, env config, express app + health route
- [x] T0.3 Mongoose models: Lead, Template, Settings

## Phase 1 — Ingestion
- [x] T1.1 scraper contract (RawLead) + normalizer (email extraction, text cleanup)
- [x] T1.2 HN scraper (freelancer + who-is-hiring threads via Algolia)
- [x] T1.3 Reddit scraper — **rewritten to Atom RSS**; `.json` now 403s without OAuth
- [x] T1.4 RemoteOK scraper
- [x] T1.5 Remotive scraper
- [x] T1.6 scorer (keywords, freelance signals, budget, recency, email)
- [x] T1.7 POST /api/scrape — run sources, dedupe-upsert, return counts

## Phase 2 — Pipeline API
- [x] T2.1 GET /api/leads with filters + GET one
- [x] T2.2 PATCH /api/leads/:id + notes + DELETE
- [x] T2.3 Templates CRUD + POST render
- [x] T2.4 Settings GET/PUT
- [x] T2.5 GET /api/stats
- [x] T2.6 POST /api/email/guess (patterns + MX check)

## Phase 3 — Client
- [x] T3.1 client scaffold, API helper, layout/nav, styles
- [x] T3.2 Dashboard (funnel, follow-ups, scrape button)
- [x] T3.3 Leads table + filters
- [x] T3.4 Lead drawer (detail, status, notes, pitch generator, copy + mailto)
- [x] T3.5 Pipeline kanban with drag-to-move
- [x] T3.6 Templates + Settings pages

## Phase 4 — Tests + E2E
- [x] T4.1 unit: normalizer, scorer, email guesser, template renderer
- [x] T4.2 unit: scraper parsers vs fixtures
- [x] T4.3 integration: API + in-memory Mongo
- [x] T4.4 E2E smoke: live scrape → 393 real leads → pipeline walkthrough
- [x] T4.5 README

## Bugs found by running it against live data

Each was caught in E2E, fixed, and covered by a regression test.

1. **Reddit 403** — `.json` endpoints now require OAuth. Rewrote the scraper against
   the public Atom feeds with a browser UA and 429 backoff.
2. **Truncated emails** — a post reading `<fname>.<lname>+hn@dat.com` yielded the
   bogus address `+hn@dat.com`. Added a plausibility check (local part may not start
   or end with punctuation; asset filenames rejected) and made re-scrape heal stored
   invalid addresses while preserving manually entered ones.
3. **Welded titles** — HN comments read `Header<p>body`, and `stripHtml` only broke on
   the closing tag, so job titles ran into the first sentence of the post. Now breaks
   on the opening tag too; re-scrape refreshes auto titles but keeps renamed ones
   (`titleEdited` flag).
4. **Substring keyword matching** — a *Retail Store Associate* post scored 76 by
   matching `rest` in "interested", `aws` in "laws", `api` in "capital". Switched to
   whole-token matching with lookarounds (works for `node.js`, `c++`).
5. **Noisy tags outweighing content** — RemoteOK auto-tagged that same retail job
   `node`, `math`, `medical`. Keyword hits are now weighted title 2× > description 1×
   > tags 0.5×.

After 4 and 5, the entire top 10 is genuine full-stack/backend work.

## Phase 5 — Dockerized (2026-08-26)
- [x] T5.1 server Dockerfile (node:22-alpine) + .dockerignore
- [x] T5.2 client Dockerfile (multi-stage vite build → nginx) + nginx.conf
- [x] T5.3 compose: mongo + server + client, healthcheck-gated startup ordering
- [x] T5.4 verified: cold start, restart resilience, live scrape from container

Notes:
- Port **8090**, not 8080 — the poker stack's `dashboard` already binds 8080.
  Overridable via `LEADFORGE_PORT`.
- Dropped `container_name:` from all services. It blocked running a second
  isolated instance, and `docker compose logs -f server` works without it.
- nginx holds the API upstream in a variable with `resolver 127.0.0.11` so it
  resolves per request; a literal `proxy_pass http://server:4100` makes nginx
  refuse to start whenever the API container isn't up yet.
- nginx proxy timeouts raised to 300s — a full scrape hits four upstream APIs
  in one request and exceeds the 60s default.
- Only the client publishes a host port; API and Mongo stay on the internal network.

## Verified end to end

- 393 real leads ingested across all four live sources
- Re-scrape updates in place: 0 duplicates across five full runs
- Pipeline state (status, notes, follow-ups) survives every re-scrape
- Pitch rendering substitutes profile + lead fields correctly
- Vite dev server proxies to the API; client typechecks and builds clean
- 48 tests passing
- Dockerized stack: all 3 containers healthy, live scrape works from inside the
  container, SPA deep links resolve, 393 leads survive `restart` and container
  recreation, cold start on an empty volume seeds defaults correctly
