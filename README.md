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
2. **Sections** → two are created on first boot: *Dev · Node.js / Backend* and
   *GTM · Product Marketing* (see [Default sections](#default-sections)). Edit them,
   or hit `+` in the sidebar to add your own.
3. **Scrape sources** (top right) → expect several hundred leads on a first run,
   filed into your sections automatically.
4. **Leads** → pick a section in the sidebar, filter to `Hot (60+)` (and a
   location: *Open to India* or *Delhi NCR*), click a row.
5. In the modal: *Pitch* tab → *Generate*, *Copy* or *Open in mail app*, then mark
   the lead **Pitched**. Set a follow-up date — it appears on the Dashboard when due.
6. **Pipeline** → drag cards between columns as conversations progress, or onto a
   sidebar section to re-file a lead.

Re-scrape daily. Existing leads are updated in place, never duplicated, and your
status, notes, and follow-ups are preserved.

## Cleaning up leads

- **Select and delete**, like a file manager: tick the box on each row, or the box
  in the header to select every lead shown. Shift-click a second box to select the
  whole range between. A bar appears with *Delete selected* and *Clear selection*;
  Esc also clears. Delete always asks first, and says how many of the selected
  leads you've already worked on (status beyond New, or notes). Changing a filter,
  the sort or the section clears the selection, so nothing off-screen is deleted.
- **🗑 Delete old leads** removes untouched leads (still New, no notes) posted more
  than 30 days ago, in the section you're viewing.
- Either way, a later scrape can bring a post back if the source still lists it.

## Filtering by location

The **Location** filter on the Leads page (also applied to *Export to Excel*):

| Option | Shows leads whose… |
|---|---|
| **Anywhere** | no filter |
| **Open to India** | location or title names India or an Indian city, or location says Worldwide / Anywhere / Global |
| **Delhi NCR** | location or title names Delhi, New Delhi, NCR, Gurgaon/Gurugram, Noida, Greater Noida, Ghaziabad or Faridabad |

HN posts carry their location in the first line, which becomes the title — hence
the title check. Matching is whole-word, so "Indiana" isn't India.

## Where the leads come from

| Source | What it gives you |
|---|---|
| **Hacker News** | The monthly *"Freelancer? Seeking freelancer?"* thread (only `SEEKING FREELANCER` posts — clients, not competitors) and *"Who is hiring?"* (~200–400 posts a month) |
| **Reddit** | `[Hiring]` posts from r/forhire, r/jobbit, r/DoneDirtCheap |
| **RemoteOK** | Public remote-jobs feed |
| **Remotive** | Public jobs feed (the free API now returns only ~15 recent jobs, whatever category is asked for) |
| **Himalayas** | Keyless search API over a large remote-jobs board, queried with each section's *search terms* — once worldwide and once for jobs that hire from India (one page of 20 each, at most 8 terms). Gives the countries each job hires from |
| **We Work Remotely** | Category RSS feeds: back-end, full-stack, sales & marketing |

Not included, on purpose: **Indeed** (blocks automated requests), **Naukri** (only
a private app API), **Wellfound** (bot challenge on job pages), **Cutshort** (robots
rules forbid job pages), **LinkedIn** (terms). Getting around those means breaking
their terms. Legal ways to add Indian on-site jobs, if needed later: Adzuna India,
Jooble or Careerjet (free API keys), or Greenhouse/Lever/Ashby feeds of chosen companies.

HN threads are matched on their exact official title, e.g. `Ask HN: Who is hiring?
(November 2026)`. A loose match once picked a newer joke post with one comment
over the real thread.

Reddit's `.json` endpoints now return 403 without OAuth, so the scraper reads the
public Atom feeds with a browser User-Agent and backs off on 429s. That feed is
rate-limited — if a scrape reports a Reddit error, wait a minute and retry; the
other sources are unaffected.

## How scoring works

Each lead gets 0–100:

- **45** relevance — a role name in the title (3) plus keyword hits weighted by
  position (title 2 > description 1 > tags 0.5, since RemoteOK's auto-tags are
  noisy enough to tag a retail job "node"); full at 6
- **20** freelance signals (`freelance`, `contract`, `hourly`, `part-time`, `fractional`, …)
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

A **section** is a named rule that files leads into a labeled pile. Fill in the
section dialog (the `+` beside SECTIONS in the sidebar, or edit an existing one),
and every lead — existing and future — gets sorted.

A section has up to four lists. All are comma- or line-separated, whole words,
case-insensitive, and a plural also matches (`api` finds "APIs"):

| List | Matched in | Effect |
|---|---|---|
| **Skill keywords** (required) | title, body, tags | Relevance score |
| **Role names** (optional) | title only | If set, a lead must have a role in its title — or 3+ skill keywords in its title/body |
| **Exclude** (optional) | title only | Title names a different stack or role → skipped, unless the title also names one of your skill keywords ("Node.js / Python Backend" stays) |
| **Search terms** (optional) | — | Sent to Himalayas on each scrape |

A section with only skill keywords works as before: one hit in the title or body
files the lead. A hit only in the source's tags no longer does.

```
Dev · Node.js / Backend   ← role in title: backend, node, full stack…   skip: rails, devops, python…
GTM · Product Marketing   ← role in title: product marketing, gtm…      skip: account executive, sdr…
Unsorted                  ← everything that matched nothing (kept, scored, browsable)
```

Clicking a section scopes the whole app to it — Dashboard counts, the Leads
table, the Pipeline board, follow-ups.

Rules worth knowing:

- **A lead belongs to exactly one section** — the qualifying one it matches most
  strongly. A hit in the title counts double a hit in the body.
- **Nothing is ever discarded.** Unmatched leads sit in Unsorted, still scored
  so the pile stays ranked. Deleting a section returns its leads to Unsorted.
- **Score is relative to the section that owns the lead**, so each section's
  ranking actually means something.
- **Moving a lead by hand pins it.** Drag a row (or a Pipeline card) onto a
  section in the sidebar, or use the Section picker in the lead modal. Pinned
  leads ignore later keyword edits and re-scrapes — the pin is yours.

### Default sections

Defined in `server/src/defaultSections.ts` and added **once per database** on boot
(a flag in Settings remembers it, so a default you delete stays deleted). A section
that already has the same name is never overwritten. Both cover jobs *and*
freelance; the freelance signals in the score lift gigs and contracts higher.

| Section | Title roles (examples) | Skips titles with | Searches Himalayas for |
|---|---|---|---|
| **Dev · Node.js / Backend** | backend, node, full stack, mern, typescript, api, platform/integration engineer, microservice, distributed systems | java, golang, python, rails, php, .net, vue, angular, mobile; devops, sre, data/ML, qa, support, sales | `node.js`, `backend engineer`, `full stack typescript` |
| **GTM · Product Marketing** | product marketing, pmm, go-to-market, gtm, growth marketing, head of growth, marketing manager/lead/director, cmo, demand gen, devrel, developer marketing | account executive/manager, sdr/bdr, sales, business development, customer success/support, recruiting, accounting, engineer(ing) | `product marketing`, `go-to-market`, `growth marketing` |

The GTM skill list holds only specific vocabulary (positioning, messaging,
competitive analysis, sales enablement, ICP, PLG…). Words like "marketing",
"growth", "SaaS" or "B2B" appear in almost every startup post and let sales
and business-development roles in.

**Upgrading an existing database:** your old sections stay as they were, and the
two defaults are added after them. Old keyword-only sections can win leads from
the new ones (ties go to the higher section), so delete or edit them once you've
checked the new piles.

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
cd server && npm test        # 105 tests, no Docker needed
```

- **Unit** — email extraction, budget parsing, HTML stripping, scoring, email
  patterns, template rendering
- **Matching** — role/skill/exclude rules, plurals, the default sections against
  real titles they used to mis-file (Paralegal, Account Executive, DevOps, Rails…),
  and one-time seeding
- **Scrapers** — each parser against recorded fixtures, no network; HN ignores a
  look-alike thread; Himalayas dedupes across queries; WWR dedupes across feeds
- **API** — full request lifecycle against an in-memory MongoDB, including scrape
  ingestion with `fetch` stubbed, dedupe on re-scrape, pipeline-state preservation,
  select-and-delete (exact ids only, bad input deletes nothing), and the location filter
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
  defaultSections.ts   the two seeded sections + one-time seeding
  scrapers/    one module per source + shared RawLead contract + xml helpers
  services/    normalize · score · classify · reclassify · ingest · location ·
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
- Sections organize what the sources return. Only Himalayas fetches by section
  (its search terms); the others return a fixed feed. A section for a market these
  job boards don't cover (buyers for a product, say) will stay empty until a
  source for it is added.
- Many remote jobs hire only from certain countries. Himalayas and We Work
  Remotely fill the Location column with that; RemoteOK and Remotive sometimes do;
  Reddit never does. The location filter can only see what the source wrote.
- Indian on-site jobs are thin: today's sources are remote-first. See the note under
  *Where the leads come from* for the legal sources that would add them.
- Sending is manual, by design. Automated cold email from a personal domain is how
  you get your address blocklisted; the tool drafts, you press send.
- No LinkedIn scraping. It violates their terms and risks a ban.
- HN "Who is hiring?" is mostly full-time roles. They still convert to contract work
  surprisingly often, but if you only want gigs, filter on the freelance signals by
  raising your minimum score.
