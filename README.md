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
2. **Sections** → hit `+` in the sidebar and create a section per thing you're
   hunting for. Keywords are matched as whole words, so `api` won't hit "capital".
3. **Scrape sources** (top right) → expect ~350–400 leads on a first run, filed
   into your sections automatically.
4. **Leads** → pick a section in the sidebar, filter to `Hot (60+)`, click a row.
5. In the modal: *Pitch* tab → *Generate*, *Copy* or *Open in mail app*, then mark
   the lead **Pitched**. Set a follow-up date — it appears on the Dashboard when due.
6. **Pipeline** → drag cards between columns as conversations progress, or onto a
   sidebar section to re-file a lead.

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

## Sections — organizing leads by what you're looking for

A **section** is a named keyword rule that files leads into a labeled pile. Type
keywords into the new-section dialog (the `+` beside SECTIONS in the sidebar),
name it, and every lead — existing and future — gets sorted.

```
GTM / Marketing   ← gtm, marketing, product marketing, growth, seo, content
Freelance / Dev   ← node, react, mongodb, typescript, contract, …
Unsorted          ← everything that matched nothing (kept, scored, browsable)
```

Clicking a section scopes the whole app to it — Dashboard counts, the Leads
table, the Pipeline board, follow-ups.

Rules worth knowing:

- **A lead belongs to exactly one section** — whichever one its keywords match
  most strongly. A hit in the title counts double a hit in the body.
- **Nothing is ever discarded.** Unmatched leads sit in Unsorted, still scored
  so the pile stays ranked. Deleting a section returns its leads to Unsorted.
- **Score is relative to the section that owns the lead**, so each section's
  ranking actually means something.
- **Moving a lead by hand pins it.** Drag a row (or a Pipeline card) onto a
  section in the sidebar, or use the Section picker in the lead modal. Pinned
  leads ignore later keyword edits and re-scrapes — the pin is yours.

## Export to Excel

The **Export to Excel** button on the Leads page downloads a real `.xlsx` of
exactly what's on screen — the active section plus whatever filters you've set.
Filename carries the scope and date: `leadforge-gtm-marketing-2026-08-27.xlsx`.

The workbook has two sheets:

- **Leads** — 16 columns (score, title, company, section, source, status, email,
  budget, location, posted, follow-up, pitched, keywords, link, notes, post body)
  with a frozen header, autofilter, clickable links, real date cells, and the
  score colour-coded the same as the UI.
- **Summary** — export timestamp, scope, total, and counts by status, section
  and source.

It's `.xlsx` rather than CSV deliberately: post bodies are full of commas,
quotes and newlines that Excel mangles on CSV import. Text beginning `=`, `+`,
`-` or `@` is written as literal text, so a scraped title can't execute as a
formula when you open the file.

## Tests

```bash
cd server && npm test        # 71 tests, no Docker needed
```

- **Unit** — email extraction, budget parsing, HTML stripping, scoring, email
  patterns, template rendering
- **Scrapers** — each parser against recorded fixtures, no network
- **API** — full request lifecycle against an in-memory MongoDB, including scrape
  ingestion with `fetch` stubbed, dedupe on re-scrape, and pipeline-state preservation
- **Sections** — classification (best match, ties, no-match → Unsorted), scoping,
  pin behaviour, and that no lead is lost when a section is edited or deleted
- **Export** — real xlsx bytes, row counts, filter/section scoping, filename
  slugs, formula-injection neutralisation, and that `/export` isn't swallowed
  by the `/:id` route

## Project layout

```
docker-compose.yml   mongo + server + client
server/Dockerfile    node:22-alpine, runs the API
client/Dockerfile    vite build → nginx serves it and proxies /api
client/nginx.conf    SPA history fallback + API proxy

server/src
  models/      Lead · Section · Template · Settings (mongoose)
  scrapers/    one module per source + shared RawLead contract
  services/    normalize · score · classify · reclassify · ingest ·
               emailGuess · renderTemplate · exportExcel
  routes/      leads · sections · scrape · templates · settings · stats · email
client/src
  SectionContext.tsx   active section + counts, shared across pages
  pages/       Dashboard · Leads · Pipeline · Templates · SettingsPage
  components/  Sidebar (sections, drop targets) · Topbar (scrape) ·
               LeadModal (detail + pitch) · NewSectionDialog · bits
```

## Notes and limits

- Single user, no auth — it binds to localhost and is meant to stay there.
- Sections organize what the four sources already return; they don't change what
  gets fetched. A section for a market these job boards don't cover (buyers for a
  product, say) will stay empty until a source for it is added.
- Sending is manual, by design. Automated cold email from a personal domain is how
  you get your address blocklisted; the tool drafts, you press send.
- No LinkedIn scraping. It violates their terms and risks a ban.
- HN "Who is hiring?" is mostly full-time roles. They still convert to contract work
  surprisingly often, but if you only want gigs, filter on the freelance signals by
  raising your minimum score.
