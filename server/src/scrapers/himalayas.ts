import type { Fetcher, RawLead, Scraper, ScrapeContext } from './types.js';
import { stripHtml } from '../services/normalize.js';

// Public, keyless search API over ~100k remote jobs, 20 per page. It's the one
// source that searches by what *you* want, using each section's searchQueries.
const SEARCH = 'https://himalayas.app/jobs/api/search';
/** Requests per scrape stay small: one page per query and country, at most this many queries. */
const MAX_QUERIES = 8;
/**
 * Each query runs once per entry: '' = worldwide, 'India' = jobs that hire from
 * India (remote). The worldwide page alone is mostly US/EU-restricted roles.
 */
const COUNTRIES = ['', 'India'];

interface HimalayasJob {
  guid?: string;
  title?: string;
  companyName?: string;
  description?: string;
  applicationLink?: string;
  employmentType?: string;
  locationRestrictions?: string[];
  parentCategories?: string[];
  minSalary?: number | null;
  maxSalary?: number | null;
  currency?: string | null;
  salaryPeriod?: string | null;
  pubDate?: number; // unix seconds
}

function budget(j: HimalayasJob): string {
  if (!j.minSalary && !j.maxSalary) return '';
  const range = [j.minSalary, j.maxSalary].filter(Boolean).join('–');
  return `${range} ${j.currency ?? ''}${j.salaryPeriod ? `/${j.salaryPeriod}` : ''}`.trim();
}

export function mapHimalayasJob(j: HimalayasJob): RawLead | null {
  if (!j.guid || !j.title) return null;
  return {
    source: 'himalayas',
    sourceId: j.guid,
    title: j.title,
    company: j.companyName ?? '',
    description: stripHtml(j.description ?? ''),
    url: j.applicationLink || j.guid,
    // Empty restrictions = hires from anywhere.
    location: j.locationRestrictions?.length ? j.locationRestrictions.join(', ') : 'Worldwide',
    tags: [...(j.parentCategories ?? []), j.employmentType ?? ''].filter(Boolean),
    budgetText: budget(j),
    postedAt: j.pubDate ? new Date(j.pubDate * 1000) : null,
  };
}

export const himalayasScraper: Scraper = {
  source: 'himalayas',
  async run(fetcher: Fetcher, ctx?: ScrapeContext): Promise<RawLead[]> {
    const queries = (ctx?.queries ?? []).slice(0, MAX_QUERIES);
    const byId = new Map<string, RawLead>(); // the same job often matches several queries
    const errors: string[] = [];
    const searches = queries.flatMap((q) => COUNTRIES.map((country) => ({ q, country })));
    for (const { q, country } of searches) {
      try {
        const params = new URLSearchParams({ q, page: '1' });
        if (country) params.set('country', country);
        const res = await fetcher(`${SEARCH}?${params}`, {
          headers: { 'User-Agent': 'leadforge-local/1.0' },
        });
        const label = country ? `"${q}" in ${country}` : `"${q}"`;
        if (!res.ok) throw new Error(`Himalayas ${label} failed: ${res.status}`);
        const data = (await res.json()) as { jobs?: HimalayasJob[] };
        for (const job of data.jobs ?? []) {
          const lead = mapHimalayasJob(job);
          if (lead) byId.set(lead.sourceId, lead);
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
    if (byId.size === 0 && errors.length > 0) throw new Error(errors.join('; '));
    return [...byId.values()];
  },
};
