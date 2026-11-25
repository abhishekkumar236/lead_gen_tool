import { describe, expect, it } from 'vitest';
import { hnScraper } from '../src/scrapers/hn.js';
import { redditScraper } from '../src/scrapers/reddit.js';
import { remoteokScraper } from '../src/scrapers/remoteok.js';
import { remotiveScraper } from '../src/scrapers/remotive.js';
import { himalayasScraper } from '../src/scrapers/himalayas.js';
import { weworkremotelyScraper } from '../src/scrapers/weworkremotely.js';
import type { Fetcher } from '../src/scrapers/types.js';
import { fakeFetch, redditForhireRss } from './fixtures/fixtures.js';

describe('hnScraper', () => {
  // Regression: a newer joke post "Ask HN: Who Is Hiring? (November 2026 – We Give
  // a Shit Edition)" with 1 comment was picked over the real 379-comment thread.
  it('picks the thread with the exact official title, not a newer look-alike', async () => {
    const urls: string[] = [];
    const spy = ((input: string | URL, init?: RequestInit) => {
      urls.push(String(input));
      return fakeFetch(input, init);
    }) as Fetcher;
    const leads = await hnScraper.run(spy);
    expect(urls.some((u) => u.includes('/items/41000002'))).toBe(true);
    expect(urls.some((u) => u.includes('/items/41000099'))).toBe(false);
    expect(leads.map((l) => l.sourceId)).toContain('41000020');
  });

  it('keeps SEEKING FREELANCER comments plus who-is-hiring posts, drops SEEKING WORK', async () => {
    const leads = await hnScraper.run(fakeFetch);
    const ids = leads.map((l) => l.sourceId);
    expect(ids).toContain('41000010'); // seeking freelancer
    expect(ids).toContain('41000020'); // who is hiring comment
    expect(ids).not.toContain('41000011'); // seeking work
    const gig = leads.find((l) => l.sourceId === '41000010')!;
    // Title is the headline only — the post body must not bleed into it.
    expect(gig.title).toBe('SEEKING FREELANCER | Node.js & React dashboard | fintech MVP');
    expect(gig.description).toContain('founder@acmefintech.com');
    expect(gig.url).toBe('https://news.ycombinator.com/item?id=41000010');
    expect(gig.postedAt).toEqual(new Date('2026-08-20T10:00:00.000Z'));
  });
});

describe('redditScraper', () => {
  it('parses the Atom feed, keeps [Hiring] only, and strips reddit nav cruft', async () => {
    const leads = await redditScraper.run(fakeFetch);
    expect(leads).toHaveLength(1);
    const lead = leads[0];
    expect(lead.sourceId).toBe('rd1'); // t3_ prefix stripped
    expect(lead.title).toBe('MERN developer for admin dashboard rebuild');
    expect(lead.url).toContain('reddit.com/r/forhire/comments/rd1');
    expect(lead.description).toContain('React + Node & MongoDB'); // double-decoded entities
    expect(lead.description).not.toContain('[link]');
    expect(lead.postedAt).toEqual(new Date('2026-08-25T09:00:00+00:00'));
  });

  it('retries on 429 rather than giving up', async () => {
    let calls = 0;
    const flaky = (async () => {
      calls++;
      if (calls < 2) return { ok: false, status: 429 } as Response;
      return { ok: true, status: 200, text: async () => redditForhireRss } as Response;
    }) as typeof fetch;
    const leads = await redditScraper.run(flaky);
    expect(calls).toBeGreaterThan(1);
    expect(leads.length).toBeGreaterThan(0);
  });

  it('surfaces an error when every subreddit fails', async () => {
    const dead = (async () => ({ ok: false, status: 403 }) as Response) as typeof fetch;
    await expect(redditScraper.run(dead)).rejects.toThrow(/403/);
  });
});

describe('remoteokScraper', () => {
  it('skips the legal notice element and maps salary', async () => {
    const leads = await remoteokScraper.run(fakeFetch);
    expect(leads).toHaveLength(1);
    expect(leads[0].sourceId).toBe('12345');
    expect(leads[0].budgetText).toBe('$40000–$70000/yr');
    expect(leads[0].description).toBe('Node.js APIs, MongoDB, part-time contract.');
  });
});

describe('remotiveScraper', () => {
  it('maps jobs with job_type folded into tags', async () => {
    const leads = await remotiveScraper.run(fakeFetch);
    expect(leads).toHaveLength(1);
    expect(leads[0].tags).toContain('contract');
    expect(leads[0].budgetText).toBe('$50/hr');
  });
});

describe('himalayasScraper', () => {
  it('searches each query worldwide and in India, and dedupes jobs found more than once', async () => {
    const urls: string[] = [];
    const spy = ((input: string | URL, init?: RequestInit) => {
      urls.push(String(input));
      return fakeFetch(input, init);
    }) as Fetcher;
    const leads = await himalayasScraper.run(spy, { queries: ['node.js', 'backend engineer'] });
    expect(urls).toHaveLength(4);
    const params = urls.map((u) => new URL(u).searchParams);
    expect(params.map((p) => `${p.get('q')}|${p.get('country') ?? ''}`)).toEqual([
      'node.js|',
      'node.js|India',
      'backend engineer|',
      'backend engineer|India',
    ]);
    expect(leads).toHaveLength(2); // "Senior Node.js Engineer" came back from both queries

    const dev = leads.find((l) => l.title === 'Senior Node.js Engineer')!;
    expect(dev.source).toBe('himalayas');
    expect(dev.sourceId).toBe('https://himalayas.app/companies/acme/jobs/node-dev');
    expect(dev.location).toBe('Worldwide'); // no restrictions = hires anywhere
    expect(dev.budgetText).toBe('60000–90000 USD/annual');
    expect(dev.tags).toContain('Contractor');
    expect(dev.description).toContain('Node.js services');
    expect(dev.postedAt).toEqual(new Date(1787572800 * 1000));

    const pmm = leads.find((l) => l.title === 'Product Marketing Manager')!;
    expect(pmm.location).toBe('India, Singapore');
    expect(pmm.budgetText).toBe('');
  });

  it('makes no request when no section has search queries', async () => {
    let calls = 0;
    const counting = (async () => {
      calls++;
      return { ok: true, status: 200, json: async () => ({ jobs: [] }) } as Response;
    }) as typeof fetch;
    expect(await himalayasScraper.run(counting, { queries: [] })).toEqual([]);
    expect(calls).toBe(0);
  });

  it('keeps results from queries that worked when another fails', async () => {
    const flaky = ((input: string | URL, init?: RequestInit) =>
      String(input).includes('q=backend')
        ? Promise.resolve({ ok: false, status: 500 } as Response)
        : fakeFetch(input, init)) as Fetcher;
    const leads = await himalayasScraper.run(flaky, { queries: ['node.js', 'backend engineer'] });
    expect(leads).toHaveLength(1);
  });

  it('surfaces an error when every query fails', async () => {
    const dead = (async () => ({ ok: false, status: 429 }) as Response) as typeof fetch;
    await expect(himalayasScraper.run(dead, { queries: ['node.js'] })).rejects.toThrow(/429/);
  });
});

describe('weworkremotelyScraper', () => {
  it('splits "Company: Title", decodes the HTML body, and dedupes across category feeds', async () => {
    const leads = await weworkremotelyScraper.run(fakeFetch);
    expect(leads.map((l) => l.sourceId).sort()).toEqual(['acme-backend', 'globex-fullstack']);

    const lead = leads.find((l) => l.sourceId === 'acme-backend')!;
    expect(lead.source).toBe('weworkremotely');
    expect(lead.title).toBe('Senior Backend Engineer');
    expect(lead.company).toBe('Acme');
    expect(lead.description).toBe('Build APIs in TypeScript & Node.js.');
    expect(lead.url).toBe('https://weworkremotely.com/remote-jobs/acme-backend');
    expect(lead.location).toBe('Anywhere in the World');
    expect(lead.tags).toEqual(['Back-End Programming', 'Contract']);
    expect(lead.postedAt).toEqual(new Date('2026-08-24T06:01:30Z'));
    expect(leads.find((l) => l.sourceId === 'globex-fullstack')!.location).toBe('USA Only');
  });

  it('surfaces an error when every feed fails', async () => {
    const dead = (async () => ({ ok: false, status: 403 }) as Response) as typeof fetch;
    await expect(weworkremotelyScraper.run(dead)).rejects.toThrow(/403/);
  });
});
