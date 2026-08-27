import { Router } from 'express';
import { getSettings, Settings } from '../models/Settings.js';

export const settingsRouter = Router();

settingsRouter.get('/', async (_req, res) => {
  res.json(await getSettings());
});

settingsRouter.put('/', async (req, res) => {
  const { myName, headline, skills, keywords, portfolioUrl, rate } = req.body ?? {};
  const update: Record<string, unknown> = {};
  if (myName !== undefined) update.myName = String(myName);
  if (headline !== undefined) update.headline = String(headline);
  if (portfolioUrl !== undefined) update.portfolioUrl = String(portfolioUrl);
  if (rate !== undefined) update.rate = String(rate);
  if (skills !== undefined) {
    if (!Array.isArray(skills)) return res.status(400).json({ error: 'skills must be an array' });
    update.skills = skills.map(String);
  }
  if (keywords !== undefined) {
    if (!Array.isArray(keywords))
      return res.status(400).json({ error: 'keywords must be an array' });
    update.keywords = keywords.map(String);
  }
  const settings = await Settings.findOneAndUpdate({ singleton: 'settings' }, update, {
    new: true,
    upsert: true,
  });
  res.json(settings);
});
