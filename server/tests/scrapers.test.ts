import { describe, expect, it } from 'vitest';
import { hnScraper } from '../src/scrapers/hn.js';
import { redditScraper } from '../src/scrapers/reddit.js';
import { remoteokScraper } from '../src/scrapers/remoteok.js';
import { remotiveScraper } from '../src/scrapers/remotive.js';
import { fakeFetch, redditForhireRss } from './fixtures/fixtures.js';

describe('hnScraper', () => {
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
