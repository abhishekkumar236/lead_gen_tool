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
  const { sort = '-score', limit = '200' } = query;
  const filter = buildLeadFilter(query);
  const leads = await Lead.find(filter)
    .sort(sort)
    .limit(Math.min(Number(limit) || 200, 1000));
  res.json(leads);
});

leadsRouter.get('/export', async (req, res) => {
  const query = req.query as Record<string, string>;
  const { sort = '-score' } = query;

  const [leads, sections] = await Promise.all([
    Lead.find(buildLeadFilter(query)).sort(sort).limit(5000).lean(),
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
