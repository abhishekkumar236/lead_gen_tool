import { Router } from 'express';
import { Template } from '../models/Template.js';
import { Lead } from '../models/Lead.js';
import { getSettings } from '../models/Settings.js';
import { buildContext, renderTemplate } from '../services/renderTemplate.js';

export const templatesRouter = Router();

templatesRouter.get('/', async (_req, res) => {
  res.json(await Template.find().sort('-updatedAt'));
});

templatesRouter.post('/', async (req, res) => {
  const { name, subject, body } = req.body ?? {};
  if (!name || !body) return res.status(400).json({ error: 'name and body required' });
  res.status(201).json(await Template.create({ name, subject: subject ?? '', body }));
});

templatesRouter.put('/:id', async (req, res) => {
  const { name, subject, body } = req.body ?? {};
  const tpl = await Template.findByIdAndUpdate(
    req.params.id,
    { name, subject, body },
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
