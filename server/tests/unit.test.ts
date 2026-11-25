import { describe, expect, it } from 'vitest';
import { extractBudget, extractEmails, stripHtml } from '../src/services/normalize.js';
import { matchesKeyword, scoreLead } from '../src/services/score.js';
import type { RawLead } from '../src/scrapers/types.js';

type RawLeadLike = RawLead;
import { generatePatterns } from '../src/services/emailGuess.js';
import { buildContext, renderTemplate } from '../src/services/renderTemplate.js';

describe('extractEmails', () => {
  it('finds plain emails and strips trailing punctuation', () => {
    expect(extractEmails('reach me at Foo.Bar@Example.COM.')).toEqual(['foo.bar@example.com']);
  });
  it('decodes [at]/[dot] obfuscation', () => {
    expect(extractEmails('jobs [at] acmecorp [dot] com')).toEqual(['jobs@acmecorp.com']);
  });
  it('dedupes', () => {
    expect(extractEmails('a@b.com and a@b.com')).toHaveLength(1);
  });
  it('returns empty when none', () => {
    expect(extractEmails('no contact here')).toEqual([]);
  });

  // Regression: a real HN post read "<fname>.<lname>+hn@dat.com" and the regex
  // bit into the middle of it, yielding the bogus address "+hn@dat.com".
  it('drops fragments captured from template placeholders', () => {
    expect(extractEmails('Reach out at <fname>.<lname>+hn@dat.com; I am hiring')).toEqual([]);
  });

  it('drops asset filenames that survive HTML stripping', () => {
    expect(extractEmails('see logo@2x.png here')).toEqual([]);
  });

  it('still keeps legitimate plus-addressing', () => {
    expect(extractEmails('mail jobs+hn@dat.com please')).toEqual(['jobs+hn@dat.com']);
  });
});

describe('extractBudget', () => {
  it('finds $ amounts', () => expect(extractBudget('Budget $4k for this')).toContain('$4'));
  it('finds hourly rates', () => expect(extractBudget('paying $50/hr')).toContain('/hr'));
  it('finds INR', () => expect(extractBudget('pay is 50,000 INR monthly')).toContain('INR'));
  it('empty when none', () => expect(extractBudget('no money mentioned')).toBe(''));
});

describe('stripHtml', () => {
  it('strips tags and decodes entities', () => {
    expect(stripHtml('<p>Node &amp; React</p><p>line2</p>')).toBe('Node & React\n\nline2');
  });

  // Regression: HN comments read "Header<p>body" — breaking only on the closing
  // tag welded the job title onto the first sentence of the post.
  it('breaks on opening <p> so the first line stays the headline', () => {
    const text = stripHtml("Acme | Senior Eng | Remote<p>We're an early-stage venture.");
    expect(text.split('\n')[0]).toBe('Acme | Senior Eng | Remote');
  });
});

describe('scoreLead', () => {
  const base = {
    source: 'hn' as const,
    sourceId: '1',
    title: 'Need Node.js freelancer',
    description: 'Contract work on a React + MongoDB app. Budget $3000.',
  };
  const keywords = { keywords: ['node', 'react', 'mongodb', 'vue'] };

  it('scores keyword matches and reports them', () => {
    const r = scoreLead(base, keywords, { hasEmail: true, budgetText: '$3000' });
    expect(r.matchedKeywords).toEqual(expect.arrayContaining(['node', 'react', 'mongodb']));
    expect(r.matchedKeywords).not.toContain('vue');
    expect(r.score).toBeGreaterThan(50);
  });

  it('fresh posts outscore stale ones', () => {
    const now = new Date('2026-08-26T00:00:00Z');
    const fresh = scoreLead(
      { ...base, postedAt: new Date('2026-08-25T00:00:00Z') },
      keywords,
      { hasEmail: false, budgetText: '', now },
    );
    const stale = scoreLead(
      { ...base, postedAt: new Date('2026-06-01T00:00:00Z') },
      keywords,
      { hasEmail: false, budgetText: '', now },
    );
    expect(fresh.score).toBeGreaterThan(stale.score);
  });

  // Regression: substring matching made a "Retail Store Associate" post score 76
  // by matching "rest" in "interested", "aws" in "laws", "api" in "capital".
  it('does not match keywords inside longer words', () => {
    const retail = scoreLead(
      {
        source: 'remoteok' as const,
        sourceId: '2',
        title: 'Retail Store Associate',
        description: 'We are interested in enthusiastic staff. Follow local laws. Capital city studio.',
      },
      { keywords: ['rest', 'aws', 'api', 'node'] },
      { hasEmail: false, budgetText: '' },
    );
    expect(retail.matchedKeywords).toEqual([]);
  });

  it('weights a title hit above a description hit above a noisy tag hit', () => {
    const mk = (over: Partial<RawLeadLike>) =>
      scoreLead(
        { source: 'remoteok', sourceId: '3', title: 'Associate', description: 'general work', ...over } as never,
        { keywords: ['node'] },
        { hasEmail: false, budgetText: '' },
      ).score;
    const inTitle = mk({ title: 'Node developer' });
    const inDesc = mk({ description: 'work with node daily' });
    const inTags = mk({ tags: ['node', 'medical', 'math'] });
    expect(inTitle).toBeGreaterThan(inDesc);
    expect(inDesc).toBeGreaterThan(inTags);
  });

  it('matches keywords containing punctuation', () => {
    expect(matchesKeyword('we use node.js here', 'node.js')).toBe(true);
    expect(matchesKeyword('nodejsx thing', 'node.js')).toBe(false);
  });

  it('matches a plain plural but still not inside longer words', () => {
    expect(matchesKeyword('public APIs', 'api')).toBe(true);
    expect(matchesKeyword('apiary visits', 'api')).toBe(false);
    expect(matchesKeyword('local laws', 'aws')).toBe(false);
  });

  it('stays within 0-100', () => {
    const r = scoreLead(
      {
        ...base,
        title: 'freelance contract hourly node react mongodb backend api',
        postedAt: new Date(),
      },
      keywords,
      { hasEmail: true, budgetText: '$1', now: new Date() },
    );
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});

describe('generatePatterns', () => {
  it('generates common corporate patterns', () => {
    const p = generatePatterns('Priya', 'Sharma', 'https://www.acme.io/about');
    expect(p).toContain('priya@acme.io');
    expect(p).toContain('priya.sharma@acme.io');
    expect(p).toContain('psharma@acme.io');
    expect(p).toContain('hello@acme.io');
  });
  it('handles missing last name', () => {
    const p = generatePatterns('Priya', '', 'acme.io');
    expect(p).toContain('priya@acme.io');
    expect(p.every((e) => e.endsWith('@acme.io'))).toBe(true);
  });
  it('empty without domain or first name', () => {
    expect(generatePatterns('', 'x', 'acme.io')).toEqual([]);
    expect(generatePatterns('x', 'y', '')).toEqual([]);
  });
});

describe('renderTemplate', () => {
  it('substitutes placeholders from settings + lead', () => {
    const ctx = buildContext(
      { myName: 'Abhi', skills: ['Node', 'React'], rate: '$30/hr' },
      { title: 'MERN dashboard', company: '', source: 'reddit' },
    );
    const out = renderTemplate('Hi {{company}}, I am {{myName}} ({{skills}}) — re {{title}}', ctx);
    expect(out).toBe('Hi your team, I am Abhi (Node, React) — re MERN dashboard');
  });
  it('unknown placeholders render empty', () => {
    expect(renderTemplate('x{{nope}}y', {})).toBe('xy');
  });
});
