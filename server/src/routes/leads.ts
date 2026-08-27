import { Router } from 'express';
import { Lead, LEAD_STATUSES } from '../models/Lead.js';

export const leadsRouter = Router();

leadsRouter.get('/', async (req, res) => {
  const { status, source, q, minScore, sort = '-score', limit = '200' } = req.query as Record<
    string,
    string
  >;
  const filter: Record<string, unknown> = {};
  if (status) filter.status = { $in: status.split(',') };
  if (source) filter.source = { $in: source.split(',') };
  if (minScore) filter.score = { $gte: Number(minScore) };
  if (q) filter.$text = { $search: q };
  const leads = await Lead.find(filter)
    .sort(sort)
    .limit(Math.min(Number(limit) || 200, 1000));
  res.json(leads);
});

leadsRouter.get('/:id', async (req, res) => {
  const lead = await Lead.findById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead not found' });
  res.json(lead);
});

leadsRouter.patch('/:id', async (req, res) => {
  const { status, contactEmail, followUpAt, company, title } = req.body ?? {};
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
