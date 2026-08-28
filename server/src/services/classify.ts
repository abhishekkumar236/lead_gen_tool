import type { RawLead } from '../scrapers/types.js';
import { scoreLead } from './score.js';

/** Minimal shape the classifier needs — keeps it testable without Mongoose. */
export interface SectionRule {
  _id: unknown;
  name: string;
  keywords: string[];
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
 * Assigns a lead to the section whose keywords it matches most strongly.
 *
 * Nothing is ever rejected: a lead matching no section's keywords returns
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
  let best: { section: SectionRule; result: ReturnType<typeof scoreLead> } | null = null;

  for (const section of sections) {
    if (!section.keywords?.length) continue;
    const result = scoreLead(lead, section.keywords, opts);
    if (result.keywordWeight <= 0) continue;
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
    const result = scoreLead(lead, [], opts);
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
  const result = scoreLead(lead, section?.keywords ?? [], opts);
  return { score: result.score, matchedKeywords: result.matchedKeywords };
}
