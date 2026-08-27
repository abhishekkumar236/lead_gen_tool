import { Lead } from '../models/Lead.js';
import { getSettings } from '../models/Settings.js';
import { getScrapers } from '../scrapers/index.js';
import type { Fetcher, RawLead } from '../scrapers/types.js';
import { extractBudget, extractEmails, isPlausible } from './normalize.js';
import { scoreLead } from './score.js';
import { config } from '../config.js';

export interface SourceResult {
  source: string;
  fetched: number;
  inserted: number;
  updated: number;
  error?: string;
}

function timeoutFetcher(fetcher: Fetcher): Fetcher {
  return ((input: any, init?: any) =>
    fetcher(input, {
      ...init,
      signal: AbortSignal.timeout(config.fetchTimeoutMs),
    })) as Fetcher;
}

export async function runScrape(
  sources?: string[],
  fetcher: Fetcher = fetch,
): Promise<SourceResult[]> {
  const settings = await getSettings();
  const keywords = settings.keywords ?? [];
  const wrapped = timeoutFetcher(fetcher);

  const results = await Promise.all(
    getScrapers(sources).map(async (scraper): Promise<SourceResult> => {
      try {
        const raw = await scraper.run(wrapped);
        let inserted = 0;
        let updated = 0;
        for (const lead of raw) {
          const outcome = await upsertLead(lead, keywords);
          if (outcome === 'inserted') inserted++;
          else if (outcome === 'updated') updated++;
        }
        return { source: scraper.source, fetched: raw.length, inserted, updated };
      } catch (err) {
        return {
          source: scraper.source,
          fetched: 0,
          inserted: 0,
          updated: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );
  return results;
}

async function upsertLead(
  raw: RawLead,
  keywords: string[],
): Promise<'inserted' | 'updated' | 'skipped'> {
  const emails = extractEmails(`${raw.title}\n${raw.description}`);
  const budgetText = raw.budgetText || extractBudget(raw.description);
  const { score, matchedKeywords } = scoreLead(raw, keywords, {
    hasEmail: emails.length > 0,
    budgetText,
  });

  const existing = await Lead.findOne({ source: raw.source, sourceId: raw.sourceId });
  if (existing) {
    // Never clobber pipeline state on re-scrape; only refresh scraped fields.
    existing.description = raw.description;
    if (!existing.titleEdited) existing.title = raw.title;
    existing.emails = emails;
    // A stored address that no longer passes validation came from an older,
    // looser extraction — replace it. Anything else is left alone so a manually
    // corrected address survives re-scrapes.
    if (existing.contactEmail && !isPlausible(existing.contactEmail)) existing.contactEmail = '';
    if (!existing.contactEmail && emails.length > 0) existing.contactEmail = emails[0];
    existing.score = score;
    existing.matchedKeywords = matchedKeywords;
    existing.budgetText = budgetText;
    existing.scrapedAt = new Date();
    await existing.save();
    return 'updated';
  }

  await Lead.create({
    ...raw,
    emails,
    contactEmail: emails[0] ?? '',
    budgetText,
    score,
    matchedKeywords,
    status: 'new',
    scrapedAt: new Date(),
  });
  return 'inserted';
}
