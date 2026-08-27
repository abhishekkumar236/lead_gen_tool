import type { Fetcher, RawLead, Scraper } from './types.js';
import { stripHtml } from '../services/normalize.js';

const ALGOLIA = 'https://hn.algolia.com/api/v1';

interface AlgoliaHit {
  objectID: string;
  title: string;
  created_at: string;
}

interface HnItem {
  id: number;
  author: string | null;
  text: string | null;
  created_at: string;
  children: HnItem[];
}

async function latestThread(fetcher: Fetcher, query: string): Promise<AlgoliaHit | null> {
  const url = `${ALGOLIA}/search_by_date?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=10`;
  const res = await fetcher(url);
  if (!res.ok) throw new Error(`HN Algolia search failed: ${res.status}`);
  const data = (await res.json()) as { hits: AlgoliaHit[] };
  // Exact-ish match: monthly threads always start with the query text.
  const hit = data.hits.find((h) => h.title?.toLowerCase().includes(query.toLowerCase()));
  return hit ?? null;
}

function commentToLead(item: HnItem, threadKind: 'freelancer' | 'hiring'): RawLead | null {
  if (!item.text) return null;
  const text = stripHtml(item.text);
  // In the freelancer thread, gigs are posted as "SEEKING FREELANCER"; the
  // other half is freelancers advertising themselves — not leads for us.
  if (threadKind === 'freelancer' && !/seeking\s+freelancer/i.test(text)) return null;
  const firstLine = text.split('\n')[0].slice(0, 140);
  return {
    source: 'hn',
    sourceId: String(item.id),
    title: firstLine || `HN post by ${item.author ?? 'unknown'}`,
    company: '',
    description: text,
    url: `https://news.ycombinator.com/item?id=${item.id}`,
    postedAt: item.created_at ? new Date(item.created_at) : null,
  };
}

async function threadLeads(
  fetcher: Fetcher,
  query: string,
  kind: 'freelancer' | 'hiring',
): Promise<RawLead[]> {
  const thread = await latestThread(fetcher, query);
  if (!thread) return [];
  const res = await fetcher(`${ALGOLIA}/items/${thread.objectID}`);
  if (!res.ok) throw new Error(`HN item fetch failed: ${res.status}`);
  const item = (await res.json()) as HnItem;
  return (item.children ?? [])
    .map((c) => commentToLead(c, kind))
    .filter((l): l is RawLead => l !== null);
}

export const hnScraper: Scraper = {
  source: 'hn',
  async run(fetcher: Fetcher): Promise<RawLead[]> {
    const [freelance, hiring] = await Promise.allSettled([
      threadLeads(fetcher, 'Freelancer? Seeking freelancer?', 'freelancer'),
      threadLeads(fetcher, 'Ask HN: Who is hiring?', 'hiring'),
    ]);
    const leads: RawLead[] = [];
    if (freelance.status === 'fulfilled') leads.push(...freelance.value);
    if (hiring.status === 'fulfilled') leads.push(...hiring.value);
    if (leads.length === 0 && freelance.status === 'rejected') throw freelance.reason;
    return leads;
  },
};
