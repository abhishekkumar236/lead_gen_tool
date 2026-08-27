import type { Fetcher, RawLead, Scraper } from './types.js';
import { stripHtml } from '../services/normalize.js';

interface RemoteOkJob {
  id?: string | number;
  slug?: string;
  position?: string;
  company?: string;
  description?: string;
  url?: string;
  location?: string;
  tags?: string[];
  salary_min?: number;
  salary_max?: number;
  date?: string;
  legal?: string; // first array element is a legal notice, not a job
}

export const remoteokScraper: Scraper = {
  source: 'remoteok',
  async run(fetcher: Fetcher): Promise<RawLead[]> {
    const res = await fetcher('https://remoteok.com/api', {
      headers: { 'User-Agent': 'leadforge-local/1.0' },
    });
    if (!res.ok) throw new Error(`RemoteOK failed: ${res.status}`);
    const data = (await res.json()) as RemoteOkJob[];
    return data
      .filter((j) => !j.legal && j.position && (j.id ?? j.slug))
      .map((j) => ({
        source: 'remoteok' as const,
        sourceId: String(j.id ?? j.slug),
        title: j.position!,
        company: j.company ?? '',
        description: stripHtml(j.description ?? ''),
        url: j.url ?? '',
        location: j.location ?? '',
        tags: j.tags ?? [],
        budgetText:
          j.salary_min && j.salary_max ? `$${j.salary_min}–$${j.salary_max}/yr` : '',
        postedAt: j.date ? new Date(j.date) : null,
      }));
  },
};
