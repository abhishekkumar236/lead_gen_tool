import type { RawLead } from '../scrapers/types.js';

const FREELANCE_SIGNALS = [
  'freelance',
  'freelancer',
  'contract',
  'contractor',
  'part-time',
  'part time',
  'hourly',
  'project basis',
  'short-term',
  'short term',
  'consultant',
  'agency',
];

export interface ScoreResult {
  score: number;
  matchedKeywords: string[];
}

/**
 * Whole-token match. Plain `includes` produced false positives that dominated the
 * board — "rest" inside "interested", "aws" inside "laws", "api" inside "capital".
 * Lookarounds rather than \b so keywords with punctuation (node.js, c++) still
 * anchor correctly.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function matchesKeyword(text: string, keyword: string): boolean {
  if (!keyword) return false;
  return new RegExp(`(?<![a-z0-9])${escapeRegex(keyword)}(?![a-z0-9])`, 'i').test(text);
}

/**
 * 0–100. Weights: keyword match 45, freelance signals 20, budget 10,
 * contact email 10, recency 15.
 *
 * Keyword hits are weighted by where they land. RemoteOK auto-tags are noisy
 * enough (a retail job tagged "node", "math", "medical") that a tag-only hit
 * must not carry the same weight as one in the title.
 */
export function scoreLead(
  lead: RawLead,
  keywords: string[],
  opts: { hasEmail: boolean; budgetText: string; now?: Date },
): ScoreResult {
  const title = lead.title.toLowerCase();
  const description = lead.description.toLowerCase();
  const tags = (lead.tags ?? []).join(' ').toLowerCase();

  let weighted = 0;
  const matched: string[] = [];
  for (const raw of keywords) {
    const k = raw.toLowerCase().trim();
    if (!k) continue;
    const inTitle = matchesKeyword(title, k);
    const inDesc = matchesKeyword(description, k);
    const inTags = matchesKeyword(tags, k);
    if (!inTitle && !inDesc && !inTags) continue;
    weighted += inTitle ? 2 : inDesc ? 1 : 0.5;
    if (inTitle || inDesc) matched.push(k);
  }
  const keywordScore = Math.min(weighted / 5, 1) * 45;

  const signalText = `${title}\n${description}`;
  const freelanceHits = FREELANCE_SIGNALS.filter((s) => matchesKeyword(signalText, s)).length;
  const freelanceScore = Math.min(freelanceHits / 2, 1) * 20;

  const budgetScore = opts.budgetText ? 10 : 0;
  const emailScore = opts.hasEmail ? 10 : 0;

  let recencyScore = 7; // unknown post date → neutral middle
  if (lead.postedAt) {
    const ageDays = ((opts.now ?? new Date()).getTime() - lead.postedAt.getTime()) / 86_400_000;
    if (ageDays <= 2) recencyScore = 15;
    else if (ageDays <= 7) recencyScore = 11;
    else if (ageDays <= 21) recencyScore = 6;
    else recencyScore = 2;
  }

  return {
    score: Math.round(keywordScore + freelanceScore + budgetScore + emailScore + recencyScore),
    matchedKeywords: [...new Set(matched)],
  };
}
