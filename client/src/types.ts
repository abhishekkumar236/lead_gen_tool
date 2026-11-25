export type LeadStatus =
  | 'new'
  | 'shortlisted'
  | 'pitched'
  | 'replied'
  | 'won'
  | 'lost'
  | 'archived';

export type LeadSource =
  | 'hn'
  | 'reddit'
  | 'remoteok'
  | 'remotive'
  | 'himalayas'
  | 'weworkremotely';

export interface Note {
  text: string;
  at: string;
}

export interface Section {
  _id: string;
  name: string;
  keywords: string[];
  titleKeywords: string[];
  excludeKeywords: string[];
  searchQueries: string[];
  color: string;
  order: number;
  count: number;
}

export interface SectionList {
  sections: Section[];
  unsortedCount: number;
  total: number;
}

/** The Unsorted bucket is a null sectionId server-side; the UI addresses it by this token. */
export const UNSORTED = 'unsorted';

export interface Lead {
  _id: string;
  sectionId: string | null;
  sectionLocked: boolean;
  source: LeadSource;
  sourceId: string;
  title: string;
  company: string;
  description: string;
  url: string;
  contactEmail: string;
  emails: string[];
  location: string;
  tags: string[];
  budgetText: string;
  score: number;
  matchedKeywords: string[];
  status: LeadStatus;
  notes: Note[];
  followUpAt: string | null;
  pitchedAt: string | null;
  postedAt: string | null;
  scrapedAt: string;
}

export interface Template {
  _id: string;
  name: string;
  subject: string;
  body: string;
  sectionId: string | null;
}

export interface Settings {
  myName: string;
  headline: string;
  skills: string[];
  keywords: string[];
  portfolioUrl: string;
  rate: string;
}

export interface Stats {
  byStatus: Partial<Record<LeadStatus, number>>;
  bySource: Partial<Record<LeadSource, number>>;
  followUpsDue: Lead[];
  topNew: Lead[];
}

export interface ScrapeResult {
  source: string;
  fetched: number;
  inserted: number;
  updated: number;
  error?: string;
}

export const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  shortlisted: 'Shortlisted',
  pitched: 'Pitched',
  replied: 'Replied',
  won: 'Won',
  lost: 'Lost',
  archived: 'Archived',
};

export const SOURCE_LABELS: Record<LeadSource, string> = {
  hn: 'Hacker News',
  reddit: 'Reddit',
  remoteok: 'RemoteOK',
  remotive: 'Remotive',
  himalayas: 'Himalayas',
  weworkremotely: 'We Work Remotely',
};
