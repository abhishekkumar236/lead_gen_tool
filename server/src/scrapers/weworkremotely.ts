import type { Fetcher, RawLead, Scraper } from './types.js';
import { stripHtml } from '../services/normalize.js';
import { tag } from './xml.js';

// Public category RSS feeds. One per kind of work the default sections hunt for.
const CATEGORIES = [
  'remote-back-end-programming-jobs',
  'remote-full-stack-programming-jobs',
  'remote-sales-and-marketing-jobs',
];

/** Items look like <title>Acme: Senior Backend Engineer</title>, <region>, <type>, <link>. */
export function parseWwrRss(xml: string): RawLead[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const leads: RawLead[] = [];
  for (const item of items) {
    const link = tag(item, 'link') || tag(item, 'guid');
    const fullTitle = tag(item, 'title');
    if (!link || !fullTitle) continue;
    const sep = fullTitle.indexOf(': ');
    const company = sep > 0 ? fullTitle.slice(0, sep) : '';
    const published = tag(item, 'pubDate');
    leads.push({
      source: 'weworkremotely',
      sourceId: link.replace(/^.*\/remote-jobs\//, ''),
      title: sep > 0 ? fullTitle.slice(sep + 2) : fullTitle,
      company,
      // Description is HTML escaped once inside the XML; tag() unescapes it.
      description: stripHtml(tag(item, 'description')),
      url: link,
      location: tag(item, 'region'),
      tags: [tag(item, 'category'), tag(item, 'type')].filter(Boolean),
      postedAt: published ? new Date(published) : null,
    });
  }
  return leads;
}

export const weworkremotelyScraper: Scraper = {
  source: 'weworkremotely',
  async run(fetcher: Fetcher): Promise<RawLead[]> {
    const byId = new Map<string, RawLead>();
    const errors: string[] = [];
    for (const cat of CATEGORIES) {
      try {
        const res = await fetcher(`https://weworkremotely.com/categories/${cat}.rss`, {
          headers: { 'User-Agent': 'leadforge-local/1.0' },
        });
        if (!res.ok) throw new Error(`We Work Remotely ${cat} failed: ${res.status}`);
        for (const lead of parseWwrRss(await res.text())) byId.set(lead.sourceId, lead);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
    if (byId.size === 0 && errors.length > 0) throw new Error(errors.join('; '));
    return [...byId.values()];
  },
};
