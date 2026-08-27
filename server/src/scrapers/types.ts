import type { LeadSource } from '../models/Lead.js';

// What every scraper emits before normalization/scoring.
export interface RawLead {
  source: LeadSource;
  sourceId: string;
  title: string;
  company?: string;
  description: string;
  url?: string;
  location?: string;
  tags?: string[];
  budgetText?: string;
  postedAt?: Date | null;
}

export type Fetcher = typeof fetch;

export interface Scraper {
  source: LeadSource;
  run(fetcher: Fetcher): Promise<RawLead[]>;
}
