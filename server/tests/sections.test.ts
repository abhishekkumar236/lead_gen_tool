import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { Lead } from '../src/models/Lead.js';
import { Section } from '../src/models/Section.js';
import { classify } from '../src/services/classify.js';
import { fakeFetch } from './fixtures/fixtures.js';

const app = createApp();
let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('leadforge-sections'));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

// ─────────────────────────── unit: the classifier ───────────────────────────

describe('classify', () => {
  const rules = [
    { _id: 'dev', name: 'Freelance / Dev', keywords: ['node', 'react', 'mongodb'], order: 0 },
    { _id: 'gtm', name: 'GTM', keywords: ['gtm', 'marketing', 'product marketing'], order: 1 },
  ];
  const opts = { hasEmail: false, budgetText: '' };
  const raw = (title: string, description = '') => ({
    source: 'hn' as const,
    sourceId: 'x',
    title,
    description,
  });

  it('files a lead into the section it matches', () => {
    expect(classify(raw('Node developer needed'), rules, opts).sectionId).toBe('dev');
    expect(classify(raw('Product marketing lead'), rules, opts).sectionId).toBe('gtm');
  });

  it('gives the lead to whichever section matches more strongly', () => {
    // "marketing" in the title (weight 2) beats "node" in the body (weight 1).
    const r = classify(raw('Marketing manager', 'some node scripting involved'), rules, opts);
    expect(r.sectionId).toBe('gtm');
  });

  it('breaks ties toward the section higher in the sidebar', () => {
    const r = classify(raw('node marketing'), rules, opts);
    expect(r.sectionId).toBe('dev'); // both weight 2; dev has order 0
  });

  it('sends a lead matching nothing to Unsorted — never discards it', () => {
    const r = classify(raw('Retail store associate', 'weekend shifts'), rules, opts);
    expect(r.sectionId).toBeNull();
    expect(r.matchedKeywords).toEqual([]);
  });

  it('still scores Unsorted leads so the pile stays ranked', () => {
    const fresh = classify(
      { ...raw('Retail associate'), postedAt: new Date() },
      rules,
      { hasEmail: true, budgetText: '$500', now: new Date() },
    );
    expect(fresh.sectionId).toBeNull();
    expect(fresh.score).toBeGreaterThan(0);
  });

  it('ignores sections with no keywords', () => {
    const r = classify(raw('anything at all'), [{ _id: 'empty', name: 'E', keywords: [], order: 0 }], opts);
    expect(r.sectionId).toBeNull();
  });
});

// ─────────────────────────── API: sections lifecycle ───────────────────────────

describe('sections API', () => {
  let devId = '';
  let gtmId = '';

  beforeAll(() => {
    vi.stubGlobal('fetch', fakeFetch);
    return () => vi.unstubAllGlobals();
  });

  it('creates a section from a comma-separated keyword string', async () => {
    const res = await request(app)
      .post('/api/sections')
      .send({ name: 'Freelance / Dev', keywords: 'node, react, mongodb, contract' });
    expect(res.status).toBe(201);
    expect(res.body.section.keywords).toEqual(['node', 'react', 'mongodb', 'contract']);
    devId = res.body.section._id;
  });

  it('rejects a section with no keywords and a duplicate name', async () => {
    expect((await request(app).post('/api/sections').send({ name: 'Empty', keywords: '' })).status).toBe(400);
    expect(
      (await request(app).post('/api/sections').send({ name: 'Freelance / Dev', keywords: 'x' })).status,
    ).toBe(409);
  });

  it('files scraped leads into sections, leaving non-matches in Unsorted', async () => {
    const gtm = await request(app)
      .post('/api/sections')
      .send({ name: 'GTM', keywords: 'marketing, gtm, growth' });
    gtmId = gtm.body.section._id;

    await request(app).post('/api/scrape').send({});

    const listed = await request(app).get('/api/sections');
    const dev = listed.body.sections.find((s: any) => s._id === devId);
    expect(dev.count).toBeGreaterThan(0);
    expect(listed.body.total).toBe(await Lead.countDocuments());
    // Nothing is thrown away: sections + unsorted account for every lead.
    const inSections = listed.body.sections.reduce((n: number, s: any) => n + s.count, 0);
    expect(inSections + listed.body.unsortedCount).toBe(listed.body.total);
  });

  it('scopes leads and stats to one section', async () => {
    const scoped = await request(app).get(`/api/leads?section=${devId}`);
    expect(scoped.status).toBe(200);
    expect(scoped.body.every((l: any) => l.sectionId === devId)).toBe(true);

    const unsorted = await request(app).get('/api/leads?section=unsorted');
    expect(unsorted.body.every((l: any) => l.sectionId === null)).toBe(true);

    const stats = await request(app).get(`/api/stats?section=${devId}`);
    const scopedTotal = Object.values(stats.body.byStatus).reduce((a: any, b: any) => a + b, 0);
    expect(scopedTotal).toBe(await Lead.countDocuments({ sectionId: devId }));
  });

  it('pins a lead when moved by hand, and keyword edits no longer move it', async () => {
    const lead = await Lead.findOne({ sectionId: devId });
    const moved = await request(app)
      .patch(`/api/leads/${lead!._id}`)
      .send({ sectionId: gtmId });
    expect(moved.status).toBe(200);
    expect(moved.body.sectionId).toBe(gtmId);
    expect(moved.body.sectionLocked).toBe(true);

    // Rewriting the Dev keywords to match it perfectly must NOT reclaim it.
    await request(app)
      .put(`/api/sections/${devId}`)
      .send({ keywords: lead!.title.toLowerCase().split(/\s+/).slice(0, 4).join(', ') });
    const after = await Lead.findById(lead!._id);
    expect(String(after!.sectionId)).toBe(gtmId);
  });

  it('moves a lead to Unsorted on request, still pinned', async () => {
    const lead = await Lead.findOne({ sectionLocked: { $ne: true } });
    const res = await request(app).patch(`/api/leads/${lead!._id}`).send({ sectionId: null });
    expect(res.body.sectionId).toBeNull();
    expect(res.body.sectionLocked).toBe(true);
  });

  it('rejects a move to a section that does not exist', async () => {
    const lead = await Lead.findOne();
    const gone = await request(app)
      .patch(`/api/leads/${lead!._id}`)
      .send({ sectionId: new mongoose.Types.ObjectId() });
    expect(gone.status).toBe(404);
    const bad = await request(app).patch(`/api/leads/${lead!._id}`).send({ sectionId: 'nope' });
    expect(bad.status).toBe(400);
  });

  it('re-classifies on a keyword edit, but leaves pinned leads where they are', async () => {
    const created = await request(app)
      .post('/api/sections')
      .send({ name: 'Temp', keywords: 'developer, engineer, node' });
    const tempId = created.body.section._id;
    expect(await Lead.countDocuments({ sectionId: tempId })).toBeGreaterThan(1);

    // Pin one of its leads, then break the keywords so nothing matches.
    const pinned = await Lead.findOne({ sectionId: tempId });
    await request(app).patch(`/api/leads/${pinned!._id}`).send({ sectionId: tempId });
    await request(app).put(`/api/sections/${tempId}`).send({ keywords: 'zzzznomatch' });

    // Everything unpinned left; the pinned lead stayed behind.
    const remaining = await Lead.find({ sectionId: tempId });
    expect(remaining).toHaveLength(1);
    expect(String(remaining[0]._id)).toBe(String(pinned!._id));

    await request(app).delete(`/api/sections/${tempId}`);
  });

  it('deleting a section keeps its leads, dropping them to Unsorted', async () => {
    const total = await Lead.countDocuments();
    const res = await request(app).delete(`/api/sections/${gtmId}`);
    expect(res.status).toBe(200);
    expect(await Lead.countDocuments()).toBe(total); // nothing deleted
    expect(await Lead.countDocuments({ sectionId: gtmId })).toBe(0);
    expect(await Section.countDocuments({ _id: gtmId })).toBe(0);
  });

  it('keeps section assignment stable across a re-scrape', async () => {
    const before = await Lead.find().sort('_id').select('sectionId').lean();
    await request(app).post('/api/scrape').send({});
    const after = await Lead.find().sort('_id').select('sectionId').lean();
    expect(after.map((l) => String(l.sectionId))).toEqual(before.map((l) => String(l.sectionId)));
  });
});
