import { Router } from 'express';
import { Section } from '../models/Section.js';
import { Lead } from '../models/Lead.js';
import { Template } from '../models/Template.js';
import { reclassifyAll } from '../services/reclassify.js';

export const sectionsRouter = Router();

function parseKeywords(input: unknown): string[] {
  // Accepts either an array or the raw "gtm, marketing, product marketing"
  // string the section search bar submits.
  const list = Array.isArray(input)
    ? input.map(String)
    : String(input ?? '').split(/[,\n]/);
  return [...new Set(list.map((k) => k.trim().toLowerCase()).filter(Boolean))];
}

/** Sections plus their live lead counts, with the synthetic Unsorted bucket last. */
sectionsRouter.get('/', async (_req, res) => {
  const [sections, counts] = await Promise.all([
    Section.find().sort('order').lean(),
    Lead.aggregate([{ $group: { _id: '$sectionId', count: { $sum: 1 } } }]),
  ]);
  const countBy = new Map(counts.map((c) => [c._id ? String(c._id) : null, c.count]));
  res.json({
    sections: sections.map((s) => ({ ...s, count: countBy.get(String(s._id)) ?? 0 })),
    unsortedCount: countBy.get(null) ?? 0,
    total: counts.reduce((sum, c) => sum + c.count, 0),
  });
});

sectionsRouter.post('/', async (req, res) => {
  const { name, keywords, titleKeywords, excludeKeywords, searchQueries, color } = req.body ?? {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
  const parsed = parseKeywords(keywords);
  if (parsed.length === 0) {
    return res.status(400).json({ error: 'at least one keyword required' });
  }
  if (await Section.findOne({ name: String(name).trim() })) {
    return res.status(409).json({ error: `a section named "${name}" already exists` });
  }
  const order = await Section.countDocuments();
  const section = await Section.create({
    name: String(name).trim(),
    keywords: parsed,
    titleKeywords: parseKeywords(titleKeywords),
    excludeKeywords: parseKeywords(excludeKeywords),
    searchQueries: parseKeywords(searchQueries),
    color: color ? String(color) : undefined,
    order,
  });
  const result = await reclassifyAll();
  res.status(201).json({ section, reclassified: result });
});

sectionsRouter.put('/:id', async (req, res) => {
  const { name, keywords, titleKeywords, excludeKeywords, searchQueries, color, order } =
    req.body ?? {};
  const section = await Section.findById(req.params.id);
  if (!section) return res.status(404).json({ error: 'section not found' });

  if (name !== undefined && String(name).trim()) {
    const clash = await Section.findOne({ name: String(name).trim(), _id: { $ne: section._id } });
    if (clash) return res.status(409).json({ error: `a section named "${name}" already exists` });
    section.name = String(name).trim();
  }
  if (keywords !== undefined) {
    const parsed = parseKeywords(keywords);
    if (parsed.length === 0) return res.status(400).json({ error: 'at least one keyword required' });
    section.keywords = parsed;
  }
  // Optional lists: an empty value clears them.
  if (titleKeywords !== undefined) section.titleKeywords = parseKeywords(titleKeywords);
  if (excludeKeywords !== undefined) section.excludeKeywords = parseKeywords(excludeKeywords);
  if (searchQueries !== undefined) section.searchQueries = parseKeywords(searchQueries);
  if (color !== undefined) section.color = String(color);
  if (order !== undefined) section.order = Number(order);

  await section.save();
  const result = await reclassifyAll();
  res.json({ section, reclassified: result });
});

sectionsRouter.delete('/:id', async (req, res) => {
  const section = await Section.findById(req.params.id);
  if (!section) return res.status(404).json({ error: 'section not found' });

  // Leads are never deleted with their section — they fall back to Unsorted,
  // losing their manual pin so the classifier can re-home them.
  await Lead.updateMany(
    { sectionId: section._id },
    { $set: { sectionId: null, sectionLocked: false } },
  );
  await Template.updateMany({ sectionId: section._id }, { $set: { sectionId: null } });
  await section.deleteOne();

  const result = await reclassifyAll();
  res.json({ deleted: true, reclassified: result });
});

sectionsRouter.post('/reclassify', async (_req, res) => {
  res.json(await reclassifyAll());
});
