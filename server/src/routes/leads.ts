import { Router } from 'express';
import mongoose from 'mongoose';
import { Lead, LEAD_STATUSES } from '../models/Lead.js';
import { Section } from '../models/Section.js';
import { buildWorkbook, exportFilename } from '../services/exportExcel.js';

export const leadsRouter = Router();

/**
 * `?section=<id>` scopes to one section, `?section=unsorted` to the leads that
 * matched nothing, and omitting it returns every section at once.
 */
export function sectionFilter(section?: string): Record<string, unknown> {
  if (!section) return {};
  if (section === 'unsorted') return { sectionId: null };
  if (!mongoose.isValidObjectId(section)) return { sectionId: null };
  return { sectionId: new mongoose.Types.ObjectId(section) };
}

/**
 * `?sort=` accepts a field with an optional leading `-` for descending:
 * `score` (default `-score`), `postedAt`, `scrapedAt`, `createdAt`, `followUpAt`.
 * `?sort=-postedAt` is "latest posts first". Date sorts are tie-broken by scrape
 * time. Descending puts undated leads last (Mongo sorts null lowest); ascending
 * would put them *first*, so those are dropped from ascending date sorts rather
 * than leading with "—". Anything else is a 400, not a raw string handed to Mongo.
 */
export const SORT_FIELDS = ['score', 'postedAt', 'scrapedAt', 'createdAt', 'followUpAt'] as const;
const DATE_FIELDS = new Set<string>(['postedAt', 'scrapedAt', 'createdAt', 'followUpAt']);

export function parseSort(raw?: string): Record<string, 1 | -1> | null {
  const value = raw?.trim() || '-score';
  const desc = value.startsWith('-');
  const field = desc ? value.slice(1) : value;
  if (!(SORT_FIELDS as readonly string[]).includes(field)) return null;
  const dir: 1 | -1 = desc ? -1 : 1;
  const sort: Record<string, 1 | -1> = { [field]: dir };
  if (DATE_FIELDS.has(field)) {
    if (field !== 'scrapedAt') sort.scrapedAt = -1;
  } else {
    sort.postedAt = -1;
  }
  return sort;
}

/** See parseSort: an ascending date sort excludes leads that have no such date. */
function nullsLast(sort: Record<string, 1 | -1>): Record<string, unknown> {
  const [field, dir] = Object.entries(sort)[0];
  return dir === 1 && DATE_FIELDS.has(field) ? { [field]: { $ne: null } } : {};
}

/** Shared by the list and the export so the spreadsheet always matches the screen. */
function buildLeadFilter(query: Record<string, string>): Record<string, unknown> {
  const { status, source, q, minScore, section } = query;
  const filter: Record<string, unknown> = { ...sectionFilter(section) };
  if (status) filter.status = { $in: status.split(',') };
  if (source) filter.source = { $in: source.split(',') };
  if (minScore) filter.score = { $gte: Number(minScore) };
  if (q) filter.$text = { $search: q };
  return filter;
}

leadsRouter.get('/', async (req, res) => {
  const query = req.query as Record<string, string>;
  const sort = parseSort(query.sort);
  if (!sort) {
    return res.status(400).json({ error: `invalid sort: ${query.sort} (use one of ${SORT_FIELDS.join(', ')}, prefix - for descending)` });
  }
  const filter = { ...buildLeadFilter(query), ...nullsLast(sort) };
  const leads = await Lead.find(filter)
    .sort(sort)
    .limit(Math.min(Number(query.limit) || 200, 1000));
  res.json(leads);
});

leadsRouter.get('/export', async (req, res) => {
  const query = req.query as Record<string, string>;
  const sort = parseSort(query.sort);
  if (!sort) {
    return res.status(400).json({ error: `invalid sort: ${query.sort} (use one of ${SORT_FIELDS.join(', ')}, prefix - for descending)` });
  }

  const [leads, sections] = await Promise.all([
    Lead.find({ ...buildLeadFilter(query), ...nullsLast(sort) }).sort(sort).limit(5000).lean(),
    Section.find().lean(),
  ]);

  const names = new Map(sections.map((s) => [String(s._id), s.name]));
  const scopeLabel =
    !query.section ? 'all leads'
    : query.section === 'unsorted' ? 'unsorted'
    : (names.get(query.section) ?? 'leads');

  const buffer = await buildWorkbook(leads, names, scopeLabel);
  const filename = exportFilename(scopeLabel);

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', String(buffer.byteLength));
  res.end(buffer);
});

/**
 * Untouched leads whose post is older than `days` (default 30): still `new`
 * with no notes. Anything the user acted on — shortlisted through won, lost,
 * archived, or noted — is pipeline history rather than clutter and is never
 * matched. A post with no date falls back to when it was scraped. Same
 * section scoping as the list, so the purge matches what's on screen.
 */
function staleFilter(query: Record<string, string>): { filter: Record<string, unknown>; days: number } {
  const days = Math.max(1, Math.floor(Number(query.days)) || 30);
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const filter: Record<string, unknown> = {
    ...sectionFilter(query.section),
    status: 'new',
    'notes.0': { $exists: false },
    $or: [{ postedAt: { $lt: cutoff } }, { postedAt: null, scrapedAt: { $lt: cutoff } }],
  };
  return { filter, days };
}

// Both sit above `/:id` so "stale" isn't swallowed as a lead id.
leadsRouter.get('/stale', async (req, res) => {
  const { filter, days } = staleFilter(req.query as Record<string, string>);
  res.json({ days, count: await Lead.countDocuments(filter) });
});

leadsRouter.delete('/stale', async (req, res) => {
  const { filter, days } = staleFilter(req.query as Record<string, string>);
  const { deletedCount } = await Lead.deleteMany(filter);
  res.json({ days, deleted: deletedCount });
});

leadsRouter.get('/:id', async (req, res) => {
  const lead = await Lead.findById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead not found' });
  res.json(lead);
});

leadsRouter.patch('/:id', async (req, res) => {
  const { status, contactEmail, followUpAt, company, title, sectionId } = req.body ?? {};
  const lead = await Lead.findById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead not found' });

  if (status !== undefined) {
    if (!LEAD_STATUSES.includes(status)) {
      return res.status(400).json({ error: `invalid status: ${status}` });
    }
    lead.status = status;
    if (status === 'pitched' && !lead.pitchedAt) lead.pitchedAt = new Date();
  }
  if (contactEmail !== undefined) lead.contactEmail = String(contactEmail);
  if (company !== undefined) lead.company = String(company);
  if (title !== undefined && String(title).trim()) {
    lead.title = String(title);
    lead.titleEdited = true;
  }
  if (followUpAt !== undefined) lead.followUpAt = followUpAt ? new Date(followUpAt) : null;

  // Moving a lead by hand pins it: re-scrapes and keyword edits leave it alone
  // from here on. Passing null moves it to Unsorted, also pinned.
  if (sectionId !== undefined) {
    if (sectionId === null || sectionId === '' || sectionId === 'unsorted') {
      lead.sectionId = null;
    } else {
      if (!mongoose.isValidObjectId(sectionId)) {
        return res.status(400).json({ error: `invalid sectionId: ${sectionId}` });
      }
      if (!(await Section.exists({ _id: sectionId }))) {
        return res.status(404).json({ error: 'section not found' });
      }
      lead.sectionId = new mongoose.Types.ObjectId(String(sectionId)) as never;
    }
    lead.sectionLocked = true;
  }

  await lead.save();
  res.json(lead);
});

leadsRouter.post('/:id/notes', async (req, res) => {
  const { text } = req.body ?? {};
  if (!text || !String(text).trim()) return res.status(400).json({ error: 'note text required' });
  const lead = await Lead.findById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead not found' });
  lead.notes.push({ text: String(text).trim(), at: new Date() });
  await lead.save();
  res.status(201).json(lead);
});

leadsRouter.delete('/:id', async (req, res) => {
  const result = await Lead.findByIdAndDelete(req.params.id);
  if (!result) return res.status(404).json({ error: 'lead not found' });
  res.status(204).end();
});
