# LeadForge

A local, free lead-generation tool for freelancing. Pulls real gigs from public
sources, scores them against your skills, and tracks each one from *found* to *won*.

No API keys. No paid services. No account. Everything runs on your machine and the
data stays in your own MongoDB.

## Stack

MongoDB · Express 5 · React 18 · Node 22 (MERN, TypeScript throughout)

## Run it

Everything runs in Docker — you don't need Node or MongoDB installed.

```bash
cd lead_gen_tool
docker compose up -d --build
```

Open **http://localhost:8090**.

| Command | What it does |
|---|---|
| `docker compose up -d --build` | Start everything (rebuild after code changes) |
| `docker compose logs -f server` | Tail the API log |
| `docker compose ps` | Health of each container |
| `docker compose down` | Stop — **your leads are kept** |
| `docker compose down -v` | Stop and **erase the database** |
| `docker compose restart` | Restart in place |

Only the UI is published to your machine, on port 8090. The API and MongoDB talk
over the internal Docker network and aren't reachable from anywhere else.

Port 8090 rather than 8080 because the poker stack's `dashboard` already holds
8080. To move it: `LEADFORGE_PORT=9000 docker compose up -d`.

Leads live in the `leadforge-mongo-data` Docker volume, so they survive
`down`, restarts, and reboots. Only `down -v` erases them.

### Running without Docker

```bash
docker compose up -d mongo                    # just the database
cd server && npm install && npm start         # API on :4100
cd ../client && npm install && npm run dev    # UI on :5173 (hot reload)
```

Use this while changing code — Vite hot-reloads, and the dev server proxies
`/api` to the local API.

## First run

1. **Settings** → fill in your name, headline, skills, portfolio URL, rate.
   Then tune **scoring keywords** — this is the main dial on lead quality.
   Only whole-word matches count, so `api` will not match "capital".
2. **Dashboard** → *Scrape all sources*. Expect ~350–400 leads on a first run.
3. **Leads** → filter to `Hot (60+)`, click a row to open it.
4. In the drawer: *Generate* a pitch, *Copy* it or *Open in mail app*, then mark
   the lead **Pitched**. Set a follow-up date — it shows up on the Dashboard when due.
5. **Pipeline** → drag cards between columns as conversations progress.

Re-scrape daily. Existing leads are updated in place, never duplicated, and your
status, notes, and follow-ups are preserved.

## Where the leads come from

| Source | What it gives you |
|---|---|
| **Hacker News** | The monthly *"Freelancer? Seeking freelancer?"* thread (only `SEEKING FREELANCER` posts — clients, not competitors) and *"Who is hiring?"* |
| **Reddit** | `[Hiring]` posts from r/forhire, r/jobbit, r/DoneDirtCheap |
| **RemoteOK** | Public remote-jobs feed |
| **Remotive** | Public software-jobs feed |

Reddit's `.json` endpoints now return 403 without OAuth, so the scraper reads the
public Atom feeds with a browser User-Agent and backs off on 429s. That feed is
rate-limited — if a scrape reports a Reddit error, wait a minute and retry; the
other three sources are unaffected.

## How scoring works

Each lead gets 0–100:

- **45** keyword match — weighted by position (title 2× > description 1× > tags 0.5×,
  since RemoteOK's auto-tags are noisy enough to tag a retail job "node")
- **20** freelance signals (`freelance`, `contract`, `hourly`, `part-time`, …)
- **10** a budget or rate is stated
- **10** a contact email was found in the post
- **15** recency (≤2 days scores full, >21 days scores near zero)

Emails are pulled from post bodies, including `name [at] domain [dot] com`
obfuscation. Fragments captured from template placeholders
(`<fname>.<lname>+hn@x.com`) are rejected.

## The email finder

**Settings → Email finder**: given a first name, last name, and company domain, it
generates the common corporate patterns (`first@`, `first.last@`, `flast@`, …) and
checks via DNS MX whether the domain can receive mail at all.

It deliberately does **not** do SMTP verification — port 25 is blocked on most home
connections, so the result would be meaningless. Treat the patterns as candidates:
send to the most likely one and watch for a bounce.

## Tests

```bash
cd server && npm test        # 48 tests, no Docker needed
```

- **Unit** — email extraction, budget parsing, HTML stripping, scoring, email
  patterns, template rendering
- **Scrapers** — each parser against recorded fixtures, no network
- **API** — full request lifecycle against an in-memory MongoDB, including scrape
  ingestion with `fetch` stubbed, dedupe on re-scrape, and pipeline-state preservation

## Project layout

```
docker-compose.yml   mongo + server + client
server/Dockerfile    node:22-alpine, runs the API
client/Dockerfile    vite build → nginx serves it and proxies /api
client/nginx.conf    SPA history fallback + API proxy

server/src
  models/      Lead, Template, Settings (mongoose)
  scrapers/    one module per source + shared RawLead contract
  services/    normalize · score · ingest · emailGuess · renderTemplate
  routes/      leads · scrape · templates · settings · stats · email
client/src
  pages/       Dashboard · Leads · Pipeline · Templates · SettingsPage
  components/  LeadDrawer (detail + pitch generator) · bits
```

## Notes and limits

- Single user, no auth — it binds to localhost and is meant to stay there.
- Sending is manual, by design. Automated cold email from a personal domain is how
  you get your address blocklisted; the tool drafts, you press send.
- No LinkedIn scraping. It violates their terms and risks a ban.
- HN "Who is hiring?" is mostly full-time roles. They still convert to contract work
  surprisingly often, but if you only want gigs, filter on the freelance signals by
  raising your minimum score.
