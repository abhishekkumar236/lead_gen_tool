import type { Fetcher, RawLead, Scraper } from './types.js';
import { stripHtml } from '../services/normalize.js';

const SUBREDDITS = ['forhire', 'jobbit', 'DoneDirtCheap'];

// Reddit's .json endpoints now return 403 to non-OAuth clients; the public Atom
// feeds still serve without credentials, but only to a browser-like User-Agent
// and with tight rate limits (429s are routine — hence the retry).
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#x27;/g, "'")
    .replace(/&#32;/g, ' ')
    .replace(/&#x2F;/g, '/')
    .replace(/&amp;/g, '&');
}

function tag(entry: string, name: string): string {
  const m = entry.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decodeXmlEntities(m[1]).trim() : '';
}

export function parseAtom(xml: string, sub: string): RawLead[] {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  const leads: RawLead[] = [];
  for (const entry of entries) {
    const title = tag(entry, 'title');
    // Keep client-side posts only: [Hiring] / [Task]. Skip [For Hire] — those
    // are other freelancers competing for the same work, not prospects.
    if (!/^\s*\[\s*(hiring|task)\s*\]/i.test(title)) continue;

    const rawId = tag(entry, 'id'); // e.g. "t3_1vytvfe"
    const id = rawId.replace(/^t3_/, '');
    if (!id) continue;

    const linkMatch = entry.match(/<link[^>]+href="([^"]+)"/);
    const content = tag(entry, 'content');
    // Reddit appends "[link] [comments]" navigation to every feed entry body.
    const body = stripHtml(content).replace(/\[link\]\s*\[comments\]\s*$/i, '').trim();
    const published = tag(entry, 'published') || tag(entry, 'updated');

    leads.push({
      source: 'reddit',
      sourceId: id,
      title: title.replace(/^\s*\[\s*(hiring|task)\s*\]\s*-?\s*/i, '').trim() || title,
      company: '',
      description: body,
      url: linkMatch ? decodeXmlEntities(linkMatch[1]) : '',
      tags: [`r/${sub}`],
      postedAt: published ? new Date(published) : null,
    });
  }
  return leads;
}

async function fetchFeed(fetcher: Fetcher, sub: string): Promise<string> {
  const url = `https://www.reddit.com/r/${sub}/new.rss?limit=100`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetcher(url, { headers: { 'User-Agent': UA, Accept: 'application/atom+xml' } });
    if (res.ok) return res.text();
    if (res.status !== 429) throw new Error(`Reddit r/${sub} failed: ${res.status}`);
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  throw new Error(`Reddit r/${sub} rate-limited (429) after 3 attempts`);
}

export const redditScraper: Scraper = {
  source: 'reddit',
  async run(fetcher: Fetcher): Promise<RawLead[]> {
    const leads: RawLead[] = [];
    const errors: string[] = [];
    for (const sub of SUBREDDITS) {
      try {
        leads.push(...parseAtom(await fetchFeed(fetcher, sub), sub));
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
    if (leads.length === 0 && errors.length > 0) throw new Error(errors.join('; '));
    return leads;
  },
};
