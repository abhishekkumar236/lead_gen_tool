import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { classify, type SectionRule } from '../src/services/classify.js';
import { scoreLead } from '../src/services/score.js';
import { DEFAULT_SECTIONS, seedDefaultSections } from '../src/defaultSections.js';
import { Section } from '../src/models/Section.js';
import { Lead } from '../src/models/Lead.js';
import { Settings } from '../src/models/Settings.js';

const opts = { hasEmail: false, budgetText: '' };
const lead = (title: string, description = '', tags: string[] = []) => ({
  source: 'remoteok' as const,
  sourceId: 'x',
  title,
  description,
  tags,
});

// ─────────────────────────── scoreLead: roles and exclusions ───────────────────────────

describe('scoreLead with roles and exclusions', () => {
  const rule = {
    keywords: ['node.js', 'redis', 'docker'],
    titleKeywords: ['backend'],
    excludeKeywords: ['python'],
  };

  it('a role in the title plus three body skills fills relevance (45)', () => {
    const full = scoreLead(lead('Senior Backend Engineer', 'Node.js, Redis, Docker'), rule, opts);
    const none = scoreLead(lead('Retail Associate'), rule, opts);
    expect(full.roleHit).toBe(true);
    expect(full.textHits).toBe(3);
    expect(full.keywordWeight).toBe(6);
    expect(full.score - none.score).toBe(45);
    expect(full.matchedKeywords).toEqual(['backend', 'node.js', 'redis', 'docker']);
  });

  it('counts a keyword and its plural as one skill', () => {
    const r = scoreLead(lead('Integrations', 'REST API design, many APIs'), { keywords: ['api'] }, opts);
    expect(r.textHits).toBe(1);
    expect(scoreLead(lead('x', 'we build webhooks'), { keywords: ['webhook'] }, opts).textHits).toBe(1);
  });

  it('only looks for roles in the title', () => {
    expect(scoreLead(lead('Engineer', 'join our backend team'), rule, opts).roleHit).toBe(false);
  });

  it('does not count tag-only hits as text hits', () => {
    const r = scoreLead(lead('Associate', '', ['node.js', 'redis']), rule, opts);
    expect(r.textHits).toBe(0);
    expect(r.keywordWeight).toBe(1); // still nudges the score: 2 × 0.5
  });

  it('excludes a title naming another stack, unless it also names one of our skills', () => {
    expect(scoreLead(lead('Senior Backend Engineer (Python)'), rule, opts).excluded).toBe(true);
    expect(scoreLead(lead('Node.js / Python Backend Engineer'), rule, opts).excluded).toBe(false);
    // Exclusions read the title only: "we also use Python" in the body is fine.
    expect(scoreLead(lead('Backend Engineer', 'we also use Python'), rule, opts).excluded).toBe(false);
  });
});

// ─────────────────────────── classify with the default sections ───────────────────────────

describe('classify with the default sections', () => {
  const rules: SectionRule[] = DEFAULT_SECTIONS.map((s, i) => ({ ...s, _id: s.name, order: i }));
  const [DEV, GTM] = rules.map((r) => r.name);
  const sectionOf = (title: string, description = '', tags: string[] = []) =>
    classify(lead(title, description, tags), rules, opts).sectionId;

  it('files developer roles into Dev', () => {
    expect(sectionOf('Senior Backend Engineer', 'Node.js, PostgreSQL, Redis')).toBe(DEV);
    expect(sectionOf('Full-Stack Developer (Node.js) | REMOTE')).toBe(DEV);
    expect(sectionOf('SEEKING FREELANCER | Node.js & React dashboard | fintech MVP')).toBe(DEV);
    expect(sectionOf('MERN developer for admin dashboard rebuild')).toBe(DEV);
  });

  it('files a generic title into Dev only when the body shows three of the skills', () => {
    expect(sectionOf('Software Engineer', 'TypeScript, Node.js services, Redis and RabbitMQ')).toBe(DEV);
    expect(sectionOf('Software Engineer', 'We use TypeScript.')).toBeNull();
  });

  it('files GTM and product marketing roles into GTM', () => {
    expect(sectionOf('Product Marketing Manager (Go-to-Market Specialist)')).toBe(GTM);
    expect(sectionOf('Head of Growth', 'B2B SaaS, positioning, launches')).toBe(GTM);
    expect(sectionOf('Fractional CMO for a dev-tools startup')).toBe(GTM);
    expect(sectionOf('Developer Advocate', 'devrel for our API platform')).toBe(GTM);
  });

  // Real titles that the old keyword-only matching filed wrongly.
  it('keeps out leads that only mention a keyword in passing', () => {
    expect(sectionOf('Paralegal', 'Our API-first platform serves law firms.')).toBeNull();
    expect(sectionOf('Head of Channel Sales & Alliances', 'AWS marketplace, API partners')).toBeNull();
    expect(sectionOf('Accounting Operations', 'support our marketing team')).toBeNull();
    // "API" + "APIs" + "scalable" used to count as three skills.
    expect(sectionOf('Manager EDI', 'Partner APIs through our API gateway; scalable flows')).toBeNull();
    expect(sectionOf('Business Development Manager', 'go-to-market, messaging, demand gen')).toBeNull();
  });

  it('keeps out other stacks and roles, even with our skills in the body', () => {
    const stack = 'Node.js, TypeScript, React, AWS';
    expect(sectionOf('Senior DevOps Engineer', stack)).toBeNull();
    expect(sectionOf('Senior Data Engineer', stack)).toBeNull();
    expect(sectionOf('Senior Vue Developer', stack)).toBeNull();
    expect(sectionOf('Tech Lead Full-Stack Rails Engineer', stack)).toBeNull();
  });

  it('keeps sales and support roles out of GTM', () => {
    const body = 'B2B SaaS marketing, pipeline, go-to-market, campaigns';
    expect(sectionOf('Account Executive', body)).toBeNull();
    expect(sectionOf('Customer Success Manager', body)).toBeNull();
    expect(sectionOf('Senior Analytics Engineer', body)).toBeNull();
    expect(sectionOf('Director, Solutions Engineering', body)).toBeNull();
    // ...but a hybrid that names GTM in the title stays.
    expect(sectionOf('Fredrin | GTM Engineer | REMOTE (US)', body)).toBe(GTM);
  });

  it('ignores noisy source tags when deciding the section', () => {
    // RemoteOK tagged this "marketing"; it was filed under GTM.
    expect(sectionOf('Field Phlebotomy Supervisor', 'Draw blood samples.', ['marketing'])).toBeNull();
  });

  it('a mixed-stack title stays in Dev when it names our stack', () => {
    expect(sectionOf('Backend Engineer (Node.js / Python)')).toBe(DEV);
  });
});

describe('classify with a plain keyword section (no role or exclude lists)', () => {
  const plain: SectionRule[] = [{ _id: 'p', name: 'Plain', keywords: ['node'], order: 0 }];

  it('still matches on a single keyword in the title or body', () => {
    expect(classify(lead('Node developer'), plain, opts).sectionId).toBe('p');
    expect(classify(lead('Developer', 'we use node daily'), plain, opts).sectionId).toBe('p');
  });

  it('no longer files a lead on a tag-only hit', () => {
    expect(classify(lead('Retail associate', '', ['node']), plain, opts).sectionId).toBeNull();
  });
});

// ─────────────────────────── seeding the defaults ───────────────────────────

describe('seedDefaultSections', () => {
  let mongod: MongoMemoryServer;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri('leadforge-seed'));
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await Promise.all([Section.deleteMany({}), Lead.deleteMany({}), Settings.deleteMany({})]);
  });

  it('creates both default sections on a fresh database, with all four lists', async () => {
    await seedDefaultSections();
    const sections = await Section.find().sort('order').lean();
    expect(sections.map((s) => s.name)).toEqual(DEFAULT_SECTIONS.map((s) => s.name));
    for (const s of sections) {
      expect(s.keywords.length).toBeGreaterThan(10);
      expect(s.titleKeywords.length).toBeGreaterThan(5);
      expect(s.excludeKeywords.length).toBeGreaterThan(5);
      expect(s.searchQueries.length).toBeGreaterThan(0);
    }
  });

  it('runs once: a deleted default does not come back on the next boot', async () => {
    await seedDefaultSections();
    await Section.deleteOne({ name: DEFAULT_SECTIONS[1].name });
    await seedDefaultSections();
    expect(await Section.countDocuments()).toBe(1);
  });

  it('adds defaults after existing sections and never overwrites a same-named one', async () => {
    await Section.create({ name: 'Mine', keywords: ['poker'], order: 0 });
    await Section.create({ name: DEFAULT_SECTIONS[0].name, keywords: ['custom'], order: 1 });
    await seedDefaultSections();

    const sections = await Section.find().sort('order').lean();
    expect(sections.map((s) => s.name)).toEqual(['Mine', ...DEFAULT_SECTIONS.map((s) => s.name)]);
    expect(sections[1].keywords).toEqual(['custom']); // left exactly as it was
    expect(sections[2].order).toBe(2);
  });

  it('files existing leads into the new sections', async () => {
    await Lead.create({ source: 'hn', sourceId: '1', title: 'Senior Backend Engineer (Node.js)' });
    await Lead.create({ source: 'hn', sourceId: '2', title: 'Product Marketing Manager' });
    await Lead.create({ source: 'hn', sourceId: '3', title: 'Bartender' });
    await seedDefaultSections();

    const byName = new Map((await Section.find().lean()).map((s) => [s.name, String(s._id)]));
    const sectionOf = async (sourceId: string) => {
      const l = await Lead.findOne({ sourceId }).lean();
      return l!.sectionId ? String(l!.sectionId) : null;
    };
    expect(await sectionOf('1')).toBe(byName.get(DEFAULT_SECTIONS[0].name));
    expect(await sectionOf('2')).toBe(byName.get(DEFAULT_SECTIONS[1].name));
    expect(await sectionOf('3')).toBeNull();
  });
});
