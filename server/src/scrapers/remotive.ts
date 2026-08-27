import type { Fetcher, RawLead, Scraper } from './types.js';
import { stripHtml } from '../services/normalize.js';

interface RemotiveJob {
  id: number;
  title: string;
  company_name: string;
  url: string;
  description: string;
  job_type: string;
  candidate_required_location: string;
  salary: string;
  tags: string[];
  publication_date: string;
}

export const remotiveScraper: Scraper = {
  source: 'remotive',
  async run(fetcher: Fetcher): Promise<RawLead[]> {
    const res = await fetcher(
      'https://remotive.com/api/remote-jobs?category=software-dev&limit=100',
    );
    if (!res.ok) throw new Error(`Remotive failed: ${res.status}`);
    const data = (await res.json()) as { jobs: RemotiveJob[] };
    return (data.jobs ?? []).map((j) => ({
      source: 'remotive' as const,
      sourceId: String(j.id),
      title: j.title,
      company: j.company_name ?? '',
      description: stripHtml(j.description ?? ''),
      url: j.url ?? '',
      location: j.candidate_required_location ?? '',
      tags: [...(j.tags ?? []), j.job_type].filter(Boolean),
      budgetText: j.salary ?? '',
      postedAt: j.publication_date ? new Date(j.publication_date) : null,
    }));
  },
};
