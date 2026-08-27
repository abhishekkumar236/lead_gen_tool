import type { Fetcher } from '../../src/scrapers/types.js';

export const hnSearchFreelancer = {
  hits: [
    {
      objectID: '41000001',
      title: 'Ask HN: Freelancer? Seeking freelancer? (August 2026)',
      created_at: '2026-08-01T15:00:00.000Z',
    },
  ],
};

export const hnSearchHiring = {
  hits: [
    {
      objectID: '41000002',
      title: 'Ask HN: Who is hiring? (August 2026)',
      created_at: '2026-08-01T15:00:00.000Z',
    },
  ],
};

export const hnItemFreelancer = {
  id: 41000001,
  author: 'whoishiring',
  text: null,
  created_at: '2026-08-01T15:00:00.000Z',
  children: [
    {
      id: 41000010,
      author: 'startupfounder',
      text: 'SEEKING FREELANCER | Node.js &amp; React dashboard | fintech MVP<p>Budget $4k, 6 weeks. Contact: founder@acmefintech.com</p>',
      created_at: '2026-08-20T10:00:00.000Z',
      children: [],
    },
    {
      id: 41000011,
      author: 'devlooking',
      text: 'SEEKING WORK — full stack dev, 8 yoe, remote.',
      created_at: '2026-08-20T11:00:00.000Z',
      children: [],
    },
  ],
};

export const hnItemHiring = {
  id: 41000002,
  author: 'whoishiring',
  text: null,
  created_at: '2026-08-01T15:00:00.000Z',
  children: [
    {
      id: 41000020,
      author: 'ctoperson',
      text: 'Acme Corp | Senior Backend Engineer (Node, TypeScript) | Remote | Contract welcome. Email jobs [at] acmecorp [dot] com',
      created_at: '2026-08-19T09:00:00.000Z',
      children: [],
    },
  ],
};

// Reddit serves Atom XML (the .json endpoints 403 without OAuth).
export const redditForhireRss = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<title>newest submissions : forhire</title>
<entry>
  <author><name>/u/client1</name></author>
  <content type="html">&lt;div class=&quot;md&quot;&gt;&lt;p&gt;Need an experienced MERN dev. Budget $2000. React + Node &amp;amp; MongoDB. Email hire@example.io&lt;/p&gt;&lt;/div&gt; &lt;span&gt;[link]&lt;/span&gt; &lt;span&gt;[comments]&lt;/span&gt;</content>
  <id>t3_rd1</id>
  <link href="https://www.reddit.com/r/forhire/comments/rd1/hiring_mern/" />
  <published>2026-08-25T09:00:00+00:00</published>
  <title>[Hiring] MERN developer for admin dashboard rebuild</title>
</entry>
<entry>
  <author><name>/u/designer1</name></author>
  <content type="html">&lt;p&gt;portfolio inside&lt;/p&gt;</content>
  <id>t3_rd2</id>
  <link href="https://www.reddit.com/r/forhire/comments/rd2/forhire_designer/" />
  <published>2026-08-25T10:00:00+00:00</published>
  <title>[For Hire] I am a designer looking for work</title>
</entry>
</feed>`;

export const redditEmptyRss = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>empty</title></feed>`;

export const remoteokJobs = [
  { legal: 'API terms: link back to remoteok' },
  {
    id: 12345,
    slug: 'backend-dev-acme',
    position: 'Backend Developer (Contract)',
    company: 'Acme Remote',
    description: '<p>Node.js APIs, MongoDB, part-time contract.</p>',
    url: 'https://remoteok.com/remote-jobs/12345',
    location: 'Worldwide',
    tags: ['node', 'mongodb', 'backend'],
    salary_min: 40000,
    salary_max: 70000,
    date: '2026-08-21T00:00:00+00:00',
  },
];

export const remotiveJobs = {
  jobs: [
    {
      id: 999,
      title: 'Full Stack Engineer',
      company_name: 'Remotive Co',
      url: 'https://remotive.com/jobs/999',
      description: '<p>React + Node. Contract role, $50/hr.</p>',
      job_type: 'contract',
      candidate_required_location: 'Anywhere',
      salary: '$50/hr',
      tags: ['react', 'node'],
      publication_date: '2026-08-22T00:00:00',
    },
  ],
};

function jsonResponse(data: unknown) {
  return { ok: true, status: 200, json: async () => data } as Response;
}

function textResponse(body: string) {
  return { ok: true, status: 200, text: async () => body } as Response;
}

/** URL-routed fake fetch covering every scraper endpoint. */
export const fakeFetch: Fetcher = (async (input: string | URL) => {
  const url = String(input);
  if (url.includes('hn.algolia.com') && url.includes('search_by_date')) {
    return jsonResponse(url.includes('Freelancer') ? hnSearchFreelancer : hnSearchHiring);
  }
  if (url.includes('hn.algolia.com/api/v1/items/41000001')) return jsonResponse(hnItemFreelancer);
  if (url.includes('hn.algolia.com/api/v1/items/41000002')) return jsonResponse(hnItemHiring);
  if (url.includes('reddit.com/r/forhire')) return textResponse(redditForhireRss);
  if (url.includes('reddit.com/r/')) return textResponse(redditEmptyRss);
  if (url.includes('remoteok.com/api')) return jsonResponse(remoteokJobs);
  if (url.includes('remotive.com/api')) return jsonResponse(remotiveJobs);
  throw new Error(`fakeFetch: unrouted url ${url}`);
}) as Fetcher;
