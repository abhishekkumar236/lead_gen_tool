import type { RawLead } from '../scrapers/types.js';
import { scoreLead, type MatchRule, type ScoreResult } from './score.js';

/** Minimal shape the classifier needs — keeps it testable without Mongoose. */
export interface SectionRule extends MatchRule {
  _id: unknown;
  name: string;
  order: number;
}

export interface Classification {
  sectionId: string | null;
  score: number;
  matchedKeywords: string[];
}

export interface ClassifyOpts {
  hasEmail: boolean;
  budgetText: string;
  now?: Date;
}

/**
 * When a section names roles, a lead whose title names none of them needs this
 * many distinct keywords in its title/body to still count — so "Paralegal" with
 * "API" somewhere in the company blurb stays out, while "Software Engineer" with
 * "Node.js, TypeScript, Redis" in the body gets in.
 */
export const MIN_TEXT_HITS_WITHOUT_ROLE = 3;

/**
 * Does this lead belong in this section at all?
 * - an exclude word in the title (and none of the section's keywords there) → no
 * - section with role names → a role in the title, or ≥3 keywords in title/body
 * - plain keyword section → at least one keyword in title/body (tag-only hits
 *   don't count: RemoteOK tags unrelated jobs "marketing" or "node")
 */
function qualifies(section: SectionRule, r: ScoreResult): boolean {
  if (r.excluded) return false;
  if (section.titleKeywords?.length) return r.roleHit || r.textHits >= MIN_TEXT_HITS_WITHOUT_ROLE;
  return r.textHits > 0;
}

/**
 * Assigns a lead to the qualifying section it matches most strongly.
 *
 * Nothing is ever rejected: a lead qualifying for no section returns
 * `sectionId: null` (Unsorted) and is still scored, so the Unsorted pile stays
 * ranked and browsable rather than becoming a dumping ground.
 *
 * Ties break toward the lower `order`, so the section sitting higher in the
 * sidebar wins — a stable, user-controllable rule rather than insertion order.
 */
export function classify(
  lead: RawLead,
  sections: SectionRule[],
  opts: ClassifyOpts,
): Classification {
  let best: { section: SectionRule; result: ScoreResult } | null = null;

  for (const section of sections) {
    if (!section.keywords?.length && !section.titleKeywords?.length) continue;
    const result = scoreLead(lead, section, opts);
    if (!qualifies(section, result)) continue;
    if (
      !best ||
      result.keywordWeight > best.result.keywordWeight ||
      (result.keywordWeight === best.result.keywordWeight && section.order < best.section.order)
    ) {
      best = { section, result };
    }
  }

  if (!best) {
    // Unsorted: still scored on the section-independent components so the pile
    // ranks by freshness, budget and reachability instead of arriving as noise.
    const result = scoreLead(lead, { keywords: [] }, opts);
    return { sectionId: null, score: result.score, matchedKeywords: [] };
  }

  return {
    sectionId: String(best.section._id),
    score: best.result.score,
    matchedKeywords: best.result.matchedKeywords,
  };
}

/** Re-scores a lead against one known section, used when a manual pin fixes the section. */
export function scoreWithinSection(
  lead: RawLead,
  section: SectionRule | null,
  opts: ClassifyOpts,
): { score: number; matchedKeywords: string[] } {
  const result = scoreLead(lead, section ?? { keywords: [] }, opts);
  return { score: result.score, matchedKeywords: result.matchedKeywords };
}
