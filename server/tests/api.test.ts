import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { Lead } from '../src/models/Lead.js';
import { fakeFetch } from './fixtures/fixtures.js';

let mongod: MongoMemoryServer;
const app = createApp();

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('leadforge-test'));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('health', () => {
  it('responds', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe('settings', () => {
  it('returns defaults with seed keywords', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body.keywords).toContain('node');
  });

  it('updates profile fields', async () => {
    const res = await request(app).put('/api/settings').send({
      myName: 'Test Dev',
      skills: ['Node', 'React'],
      keywords: ['node', 'react', 'mongodb', 'mern'],
      rate: '$30/hr',
    });
    expect(res.status).toBe(200);
    expect(res.body.myName).toBe('Test Dev');
    expect(res.body.keywords).toEqual(['node', 'react', 'mongodb', 'mern']);
  });

  it('rejects non-array keywords', async () => {
    const res = await request(app).put('/api/settings').send({ keywords: 'node' });
    expect(res.status).toBe(400);
  });
});

describe('scrape', () => {
  beforeAll(() => {
    vi.stubGlobal('fetch', fakeFetch);
    return () => vi.unstubAllGlobals();
  });

  it('rejects unknown sources', async () => {
    const res = await request(app).post('/api/scrape').send({ sources: ['linkedin'] });
    expect(res.status).toBe(400);
  });

  it('ingests, scores and dedupes across all sources', async () => {
    const res = await request(app).post('/api/scrape').send({});
    expect(res.status).toBe(200);
    const bySource = Object.fromEntries(
      res.body.results.map((r: any) => [r.source, r]),
    );
    expect(bySource.hn.inserted).toBe(2);
    expect(bySource.reddit.inserted).toBe(1);
    expect(bySource.remoteok.inserted).toBe(1);
    expect(bySource.remotive.inserted).toBe(1);
    expect(bySource.weworkremotely.inserted).toBe(2);
    // No section has search queries in this suite, so the search source stays idle.
    expect(bySource.himalayas).toMatchObject({ fetched: 0, inserted: 0 });
    expect(res.body.results.filter((r: any) => r.error)).toEqual([]);

    // contact email auto-extracted from post body
    const gig = await Lead.findOne({ source: 'hn', sourceId: '41000010' });
    expect(gig!.contactEmail).toBe('founder@acmefintech.com');
    expect(gig!.score).toBeGreaterThan(0);

    // obfuscated email decoded
    const hiringPost = await Lead.findOne({ source: 'hn', sourceId: '41000020' });
    expect(hiringPost!.contactEmail).toBe('jobs@acmecorp.com');

    // re-scrape: everything updates, nothing duplicates
    const res2 = await request(app).post('/api/scrape').send({});
    const hn2 = res2.body.results.find((r: any) => r.source === 'hn');
    expect(hn2.inserted).toBe(0);
    expect(hn2.updated).toBe(2);
    expect(await Lead.countDocuments()).toBe(7);
  });

  it('re-scrape heals a stale invalid email but keeps a manual one', async () => {
    await Lead.updateOne({ source: 'hn', sourceId: '41000010' }, { contactEmail: '+hn@bogus.com' });
    await request(app).post('/api/scrape').send({ sources: ['hn'] });
    const healed = await Lead.findOne({ source: 'hn', sourceId: '41000010' });
    expect(healed!.contactEmail).toBe('founder@acmefintech.com');

    await Lead.updateOne({ source: 'hn', sourceId: '41000010' }, { contactEmail: 'me@manual.com' });
    await request(app).post('/api/scrape').send({ sources: ['hn'] });
    const kept = await Lead.findOne({ source: 'hn', sourceId: '41000010' });
    expect(kept!.contactEmail).toBe('me@manual.com');
  });

  it('re-scrape refreshes an auto title but keeps a renamed one', async () => {
    await Lead.updateOne({ source: 'hn', sourceId: '41000010' }, { title: 'stale welded title' });
    await request(app).post('/api/scrape').send({ sources: ['hn'] });
    const healed = await Lead.findOne({ source: 'hn', sourceId: '41000010' });
    expect(healed!.title).toContain('SEEKING FREELANCER');

    await request(app).patch(`/api/leads/${healed!._id}`).send({ title: 'My renamed lead' });
    await request(app).post('/api/scrape').send({ sources: ['hn'] });
    const kept = await Lead.findOne({ source: 'hn', sourceId: '41000010' });
    expect(kept!.title).toBe('My renamed lead');
  });

  it('re-scrape preserves pipeline status', async () => {
    await Lead.updateOne({ source: 'reddit', sourceId: 'rd1' }, { status: 'pitched' });
    await request(app).post('/api/scrape').send({ sources: ['reddit'] });
    const lead = await Lead.findOne({ source: 'reddit', sourceId: 'rd1' });
    expect(lead!.status).toBe('pitched');
  });
});

describe('leads', () => {
  it('lists with filters and sorts by score', async () => {
    const res = await request(app).get('/api/leads?status=new&minScore=1&sort=-score');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    const scores = res.body.map((l: any) => l.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('sorts by posting date, newest first, undated last', async () => {
    const res = await request(app).get('/api/leads?sort=-postedAt');
    expect(res.status).toBe(200);
    const dates = res.body.map((l: any) => l.postedAt);
    const dated = dates.filter(Boolean);
    expect(dated.length).toBeGreaterThan(1);
    expect([...dated].sort().reverse()).toEqual(dated);
    // nulls sit after every dated lead
    expect(dates.indexOf(null) === -1 || dates.indexOf(null) === dated.length).toBe(true);

    const asc = await request(app).get('/api/leads?sort=postedAt');
    const ascDates = asc.body.map((l: any) => l.postedAt);
    expect(ascDates.every(Boolean)).toBe(true); // undated dropped, not leading
    expect([...ascDates].sort()).toEqual(ascDates);
  });

  it('filters by location: Delhi NCR, and anything open to India', async () => {
    const mk = (sourceId: string, title: string, location = '') =>
      Lead.create({ source: 'himalayas', sourceId, title, location });
    await Promise.all([
      mk('loc-gurgaon', 'Backend Engineer', 'Gurugram, Haryana'),
      mk('loc-noida', 'Node.js Developer', 'Noida'),
      // HN keeps the location in the title's first line, not in `location`.
      mk('loc-hn-delhi', 'Acme | Senior Backend Engineer | New Delhi | ONSITE'),
      mk('loc-india', 'Product Marketing Manager', 'India, Singapore'),
      mk('loc-blr', 'Full Stack Developer', 'Bengaluru'),
      mk('loc-world', 'Senior Node.js Engineer', 'Worldwide'),
      mk('loc-anywhere', 'Growth Lead', 'Anywhere in the World'),
      mk('loc-us', 'Backend Engineer', 'USA Only'),
      // Look-alikes that must not match.
      mk('loc-indiana', 'Backend Engineer', 'Indianapolis, Indiana'),
      mk('loc-global-title', 'Global Partnerships Lead', 'Canada'),
    ]);
    const ids = async (location: string) => {
      const res = await request(app).get(`/api/leads?location=${location}&limit=1000`);
      expect(res.status).toBe(200);
      return res.body
        .map((l: any) => l.sourceId)
        .filter((s: string) => s.startsWith('loc-'))
        .sort();
    };

    expect(await ids('ncr')).toEqual(['loc-gurgaon', 'loc-hn-delhi', 'loc-noida']);
    expect(await ids('india')).toEqual(
      ['loc-anywhere', 'loc-blr', 'loc-gurgaon', 'loc-hn-delhi', 'loc-india', 'loc-noida', 'loc-world'],
    );

    // Unknown value: rejected on the list and the export alike.
    expect((await request(app).get('/api/leads?location=mars')).status).toBe(400);
    expect((await request(app).get('/api/leads/export?location=mars')).status).toBe(400);
    expect((await request(app).get('/api/leads/export?location=ncr')).status).toBe(200);

    await Lead.deleteMany({ sourceId: /^loc-/ });
  });

  it('rejects an unknown sort field', async () => {
    const res = await request(app).get('/api/leads?sort=-description');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid sort/);
    const exp = await request(app).get('/api/leads/export?sort=$where');
    expect(exp.status).toBe(400);
  });

  it('moves a lead through the pipeline and stamps pitchedAt', async () => {
    const lead = await Lead.findOne({ source: 'hn', sourceId: '41000010' });
    const res = await request(app)
      .patch(`/api/leads/${lead!._id}`)
      .send({ status: 'pitched', followUpAt: '2026-08-30T00:00:00Z' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pitched');
    expect(res.body.pitchedAt).toBeTruthy();
    expect(res.body.followUpAt).toBe('2026-08-30T00:00:00.000Z');
  });

  it('rejects invalid status', async () => {
    const lead = await Lead.findOne();
    const res = await request(app).patch(`/api/leads/${lead!._id}`).send({ status: 'nope' });
    expect(res.status).toBe(400);
  });

  it('adds notes', async () => {
    const lead = await Lead.findOne();
    const res = await request(app)
      .post(`/api/leads/${lead!._id}/notes`)
      .send({ text: 'sent pitch v1' });
    expect(res.status).toBe(201);
    expect(res.body.notes.at(-1).text).toBe('sent pitch v1');
  });

  it('purges only untouched leads older than N days, scoped by section', async () => {
    const day = 86_400_000;
    const old = new Date(Date.now() - 45 * day);
    const fresh = new Date(Date.now() - 5 * day);

    // Own section so the scrape fixtures (unsorted, old) stay out of the counts,
    // and the stats test that follows still sees the same leads.
    const sec = await request(app).post('/api/sections').send({ name: 'Purge', keywords: 'zzznomatch' });
    const sectionId = sec.body.section._id;
    const mk = (sourceId: string, extra: Record<string, unknown>) =>
      Lead.create({ source: 'hn', sourceId, title: `purge ${sourceId}`, sectionId, sectionLocked: true, ...extra });

    const [gone, goneUndated, keptFresh, keptPitched, keptNoted, keptUnsorted] = await Promise.all([
      mk('p-old', { postedAt: old }),
      mk('p-undated', { postedAt: null, scrapedAt: old }),
      mk('p-fresh', { postedAt: fresh }),
      mk('p-pitched', { postedAt: old, status: 'pitched' }),
      mk('p-noted', { postedAt: old, notes: [{ text: 'called them', at: new Date() }] }),
      mk('p-unsorted', { postedAt: old, sectionId: null }),
    ]);

    const count = await request(app).get(`/api/leads/stale?days=30&section=${sectionId}`);
    expect(count.status).toBe(200);
    expect(count.body).toEqual({ days: 30, count: 2 });

    const res = await request(app).delete(`/api/leads/stale?days=30&section=${sectionId}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ days: 30, deleted: 2 });

    expect(await Lead.findById(gone._id)).toBeNull();
    expect(await Lead.findById(goneUndated._id)).toBeNull();
    for (const kept of [keptFresh, keptPitched, keptNoted, keptUnsorted]) {
      expect(await Lead.findById(kept._id)).not.toBeNull();
    }

    // A bad `days` falls back to 30; a wider window catches the fresh one too.
    const bad = await request(app).get(`/api/leads/stale?days=abc&section=${sectionId}`);
    expect(bad.body).toEqual({ days: 30, count: 0 });
    const wide = await request(app).get(`/api/leads/stale?days=1&section=${sectionId}`);
    expect(wide.body).toEqual({ days: 1, count: 1 });

    await Lead.deleteMany({ sourceId: /^p-/ });
    await request(app).delete(`/api/sections/${sectionId}`);
  });

  it('bulk-deletes exactly the selected leads, whatever their status', async () => {
    const mk = (sourceId: string, extra: Record<string, unknown> = {}) =>
      Lead.create({ source: 'hn', sourceId, title: `bulk ${sourceId}`, ...extra });
    const [a, b, keep] = await Promise.all([
      mk('b-a'),
      mk('b-b', { status: 'pitched', notes: [{ text: 'sent', at: new Date() }] }),
      mk('b-keep'),
    ]);
    const missing = String(new mongoose.Types.ObjectId());

    const res = await request(app)
      .post('/api/leads/bulk-delete')
      // a repeated id and one that's already gone are tolerated
      .send({ ids: [String(a._id), String(b._id), String(a._id), missing] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: 2 });
    expect(await Lead.findById(a._id)).toBeNull();
    expect(await Lead.findById(b._id)).toBeNull();
    expect(await Lead.findById(keep._id)).not.toBeNull();

    // Deleting the same selection again (double-click, stale tab) is harmless.
    const again = await request(app).post('/api/leads/bulk-delete').send({ ids: [String(a._id)] });
    expect(again.body).toEqual({ deleted: 0 });

    await Lead.deleteMany({ sourceId: /^b-/ });
  });

  it('rejects a bulk delete with no ids, bad ids, or too many ids — deleting nothing', async () => {
    const before = await Lead.countDocuments();
    const valid = String(new mongoose.Types.ObjectId());
    const cases = [
      {},
      { ids: [] },
      { ids: valid },
      { ids: [valid, 'not-an-id'] },
      { ids: [valid, 42] },
      { ids: Array.from({ length: 1001 }, () => valid) },
    ];
    for (const body of cases) {
      const res = await request(app).post('/api/leads/bulk-delete').send(body);
      expect(res.status, JSON.stringify(body).slice(0, 60)).toBe(400);
    }
    expect(await Lead.countDocuments()).toBe(before);
  });

  it('404s on missing lead, 500s contained on malformed id', async () => {
    const missing = await request(app).get(`/api/leads/${new mongoose.Types.ObjectId()}`);
    expect(missing.status).toBe(404);
    const malformed = await request(app).get('/api/leads/not-an-id');
    expect(malformed.status).toBe(500); // CastError → error middleware, not a crash
  });
});

describe('templates', () => {
  it('creates and renders against a lead with settings substitution', async () => {
    const created = await request(app).post('/api/templates').send({
      name: 't1',
      subject: 'Re: {{title}}',
      body: 'Hi {{company}}, I am {{myName}} — {{skills}}. Rate {{rate}}.',
    });
    expect(created.status).toBe(201);

    const lead = await Lead.findOne({ source: 'remoteok' });
    const rendered = await request(app)
      .post(`/api/templates/${created.body._id}/render`)
      .send({ leadId: String(lead!._id) });
    expect(rendered.status).toBe(200);
    expect(rendered.body.subject).toBe('Re: Backend Developer (Contract)');
    expect(rendered.body.body).toBe(
      'Hi Acme Remote, I am Test Dev — Node, React. Rate $30/hr.',
    );
  });

  it('requires name and body', async () => {
    const res = await request(app).post('/api/templates').send({ name: 'x' });
    expect(res.status).toBe(400);
  });
});

describe('stats', () => {
  it('returns funnel + source counts', async () => {
    const res = await request(app).get('/api/stats');
    expect(res.status).toBe(200);
    expect(res.body.bySource.hn).toBe(2);
    expect(res.body.byStatus.pitched).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.body.topNew)).toBe(true);
  });
});

describe('email guess', () => {
  it('requires domain', async () => {
    const res = await request(app).post('/api/email/guess').send({ firstName: 'a' });
    expect(res.status).toBe(400);
  });
});
