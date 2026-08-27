import type { Scraper } from './types.js';
import { hnScraper } from './hn.js';
import { redditScraper } from './reddit.js';
import { remoteokScraper } from './remoteok.js';
import { remotiveScraper } from './remotive.js';

export const scrapers: Scraper[] = [hnScraper, redditScraper, remoteokScraper, remotiveScraper];

export function getScrapers(sources?: string[]): Scraper[] {
  if (!sources || sources.length === 0) return scrapers;
  return scrapers.filter((s) => sources.includes(s.source));
}
