import { Router } from 'express';
import { guessEmails } from '../services/emailGuess.js';

export const emailRouter = Router();

emailRouter.post('/guess', async (req, res) => {
  const { firstName = '', lastName = '', domain } = req.body ?? {};
  if (!domain || !String(domain).trim()) {
    return res.status(400).json({ error: 'domain required' });
  }
  res.json(await guessEmails(String(firstName), String(lastName), String(domain)));
});
