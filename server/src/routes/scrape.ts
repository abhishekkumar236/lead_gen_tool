import { Router } from 'express';
import { runScrape } from '../services/ingest.js';
import { LEAD_SOURCES } from '../models/Lead.js';

export const scrapeRouter = Router();

scrapeRouter.post('/', async (req, res) => {
  const { sources } = (req.body ?? {}) as { sources?: string[] };
  if (sources) {
    const bad = sources.filter((s) => !(LEAD_SOURCES as readonly string[]).includes(s));
    if (bad.length > 0) {
      return res.status(400).json({ error: `unknown sources: ${bad.join(', ')}` });
    }
  }
  const results = await runScrape(sources);
  res.json({ results });
});
