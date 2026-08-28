import { Router } from 'express';
import mongoose from 'mongoose';
import { Template } from '../models/Template.js';
import { Lead } from '../models/Lead.js';
import { getSettings } from '../models/Settings.js';
import { buildContext, renderTemplate } from '../services/renderTemplate.js';

export const templatesRouter = Router();

templatesRouter.get('/', async (req, res) => {
  // Shared templates (sectionId null) stay visible in every section, so the
  // active section widens the list rather than narrowing it to nothing.
  const { section } = req.query as Record<string, string>;
  const filter =
    section && section !== 'unsorted' && mongoose.isValidObjectId(section)
      ? { $or: [{ sectionId: null }, { sectionId: new mongoose.Types.ObjectId(section) }] }
      : { sectionId: null };
  res.json(await Template.find(section ? filter : {}).sort('-updatedAt'));
});

templatesRouter.post('/', async (req, res) => {
  const { name, subject, body, sectionId } = req.body ?? {};
  if (!name || !body) return res.status(400).json({ error: 'name and body required' });
  const scoped =
    sectionId && mongoose.isValidObjectId(sectionId)
      ? new mongoose.Types.ObjectId(String(sectionId))
      : null;
  res
    .status(201)
    .json(await Template.create({ name, subject: subject ?? '', body, sectionId: scoped }));
});

templatesRouter.put('/:id', async (req, res) => {
  const { name, subject, body, sectionId } = req.body ?? {};
  const update: Record<string, unknown> = { name, subject, body };
  if (sectionId !== undefined) {
    update.sectionId =
      sectionId && mongoose.isValidObjectId(sectionId)
        ? new mongoose.Types.ObjectId(String(sectionId))
        : null;
  }
  const tpl = await Template.findByIdAndUpdate(
    req.params.id,
    update,
    { new: true, runValidators: true },
  );
  if (!tpl) return res.status(404).json({ error: 'template not found' });
  res.json(tpl);
});

templatesRouter.delete('/:id', async (req, res) => {
  const result = await Template.findByIdAndDelete(req.params.id);
  if (!result) return res.status(404).json({ error: 'template not found' });
  res.status(204).end();
});

templatesRouter.post('/:id/render', async (req, res) => {
  const { leadId } = req.body ?? {};
  const tpl = await Template.findById(req.params.id);
  if (!tpl) return res.status(404).json({ error: 'template not found' });
  const lead = leadId ? await Lead.findById(leadId) : null;
  if (leadId && !lead) return res.status(404).json({ error: 'lead not found' });
  const settings = await getSettings();
  const ctx = buildContext(settings.toObject(), lead ? lead.toObject() : {});
  res.json({
    subject: renderTemplate(tpl.subject ?? '', ctx),
    body: renderTemplate(tpl.body, ctx),
    to: lead?.contactEmail ?? '',
  });
});
