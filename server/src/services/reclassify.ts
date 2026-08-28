import { Lead } from '../models/Lead.js';
import { Section } from '../models/Section.js';
import type { RawLead } from '../scrapers/types.js';
import { classify, scoreWithinSection, type SectionRule } from './classify.js';

export async function loadSectionRules(): Promise<SectionRule[]> {
  const sections = await Section.find().sort('order').lean();
  return sections.map((s) => ({
    _id: s._id,
    name: s.name,
    keywords: s.keywords ?? [],
    order: s.order ?? 0,
  }));
}

/** Lead documents carry every field the scorer reads; this just narrows the type. */
export function leadAsRaw(lead: {
  title?: string;
  description?: string;
  tags?: string[];
  postedAt?: Date | null;
}): RawLead {
  return {
    source: 'hn',
    sourceId: '',
    title: lead.title ?? '',
    description: lead.description ?? '',
    tags: lead.tags ?? [],
    postedAt: lead.postedAt ?? null,
  };
}

export interface ReclassifyResult {
  scanned: number;
  moved: number;
  pinned: number;
}

/**
 * Re-runs classification across the whole pool. Called after a section is
 * created, edited or deleted.
 *
 * Manually pinned leads keep their section — they're only re-scored against it,
 * so a lead you filed by hand never jumps back out on a keyword edit.
 */
export async function reclassifyAll(): Promise<ReclassifyResult> {
  const rules = await loadSectionRules();
  const byId = new Map(rules.map((r) => [String(r._id), r]));
  const leads = await Lead.find();

  let moved = 0;
  let pinned = 0;

  for (const lead of leads) {
    const raw = leadAsRaw(lead);
    const opts = {
      hasEmail: Boolean(lead.contactEmail) || (lead.emails?.length ?? 0) > 0,
      budgetText: lead.budgetText ?? '',
    };

    if (lead.sectionLocked) {
      const section = lead.sectionId ? (byId.get(String(lead.sectionId)) ?? null) : null;
      const { score, matchedKeywords } = scoreWithinSection(raw, section, opts);
      // A pinned lead whose section was deleted falls back to Unsorted, but
      // stays pinned so it won't be swept up by unrelated keyword edits.
      if (lead.sectionId && !section) lead.sectionId = null;
      lead.score = score;
      lead.matchedKeywords = matchedKeywords;
      pinned++;
      await lead.save();
      continue;
    }

    const next = classify(raw, rules, opts);
    const before = lead.sectionId ? String(lead.sectionId) : null;
    if (before !== next.sectionId) moved++;
    lead.sectionId = next.sectionId as never;
    lead.score = next.score;
    lead.matchedKeywords = next.matchedKeywords;
    await lead.save();
  }

  return { scanned: leads.length, moved, pinned };
}
