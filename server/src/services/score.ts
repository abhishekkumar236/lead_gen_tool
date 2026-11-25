import type { RawLead } from '../scrapers/types.js';

// 'agency' was dropped: it made "Agency Partnerships Director" look like a gig.
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
  'fractional',
  'retainer',
  '1099',
];

/** A role named in the title counts like 1.5 title keyword hits. */
const ROLE_WEIGHT = 3;
/** Relevance weight at which the 45-point relevance component is full. */
const KEYWORD_SATURATION = 6;

/**
 * What a section matches on. Only `keywords` is required, so a plain keyword
 * section behaves as before.
 * - keywords:        skills/topics, searched in title (2), body (1), tags (0.5)
 * - titleKeywords:   role names, searched in the title only ("backend", "product marketing")
 * - excludeKeywords: a title containing one is not this section's kind of job ("rails",
 *                    "account executive") — unless the title also names one of `keywords`,
 *                    so "Node.js / Python Backend" survives a "python" exclusion.
 */
export interface MatchRule {
  keywords: string[];
  titleKeywords?: string[];
  excludeKeywords?: string[];
}

export interface ScoreResult {
  score: number;
  matchedKeywords: string[];
  /**
   * Raw relevance weight before the 45-point cap. The classifier ranks sections
   * by this rather than by `score`: the other four components (freelance
   * signals, budget, email, recency) are section-independent, so they'd add the
   * same constant to every candidate and only blur ties.
   */
  keywordWeight: number;
  /** A titleKeyword appears in the title. */
  roleHit: boolean;
  /** Distinct keywords found in the title or body. Tags don't count: RemoteOK tags a retail job "node". */
  textHits: number;
  /** The title has an exclude word and none of the section's keywords. */
  excluded: boolean;
}

/**
 * Whole-token match. Plain `includes` produced false positives that dominated the
 * board — "rest" inside "interested", "aws" inside "laws", "api" inside "capital".
 * Lookarounds rather than \b so keywords with punctuation (node.js, c++) still
 * anchor correctly. A trailing "s" is allowed, so "api" also matches "APIs" —
 * otherwise "api" + "apis" in one post counted as two different skills.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function matchesKeyword(text: string, keyword: string): boolean {
  if (!keyword) return false;
  return new RegExp(`(?<![a-z0-9])${escapeRegex(keyword)}s?(?![a-z0-9])`, 'i').test(text);
}

function clean(list: string[] | undefined): string[] {
  return (list ?? []).map((k) => k.toLowerCase().trim()).filter(Boolean);
}

/**
 * 0–100. Weights: relevance 45, freelance signals 20, budget 10,
 * contact email 10, recency 15.
 *
 * Relevance = role in title (3) + keyword hits weighted by where they land
 * (title 2, body 1, tag 0.5), full at 6. RemoteOK auto-tags are noisy enough
 * (a retail job tagged "node", "math", "medical") that a tag-only hit must not
 * carry the same weight as one in the title.
 *
 * Example, Dev section: title "Senior Backend Engineer", body "Node.js, Redis, Docker"
 * → role 3 + node.js 1 + redis 1 + docker 1 = 6 → full 45.
 */
export function scoreLead(
  lead: RawLead,
  rule: MatchRule,
  opts: { hasEmail: boolean; budgetText: string; now?: Date },
): ScoreResult {
  const title = lead.title.toLowerCase();
  const description = lead.description.toLowerCase();
  const tags = (lead.tags ?? []).join(' ').toLowerCase();

  let weighted = 0;
  let textHits = 0;
  let keywordInTitle = false;
  const matched: string[] = [];

  const roles = clean(rule.titleKeywords).filter((k) => matchesKeyword(title, k));
  const roleHit = roles.length > 0;
  if (roleHit) {
    weighted += ROLE_WEIGHT;
    matched.push(...roles);
  }

  for (const k of clean(rule.keywords)) {
    const inTitle = matchesKeyword(title, k);
    const inDesc = matchesKeyword(description, k);
    const inTags = matchesKeyword(tags, k);
    if (!inTitle && !inDesc && !inTags) continue;
    weighted += inTitle ? 2 : inDesc ? 1 : 0.5;
    if (inTitle) keywordInTitle = true;
    if (inTitle || inDesc) {
      textHits++;
      matched.push(k);
    }
  }

  const excluded =
    !keywordInTitle && clean(rule.excludeKeywords).some((k) => matchesKeyword(title, k));

  const keywordScore = Math.min(weighted / KEYWORD_SATURATION, 1) * 45;

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
    keywordWeight: weighted,
    roleHit,
    textHits,
    excluded,
  };
}
