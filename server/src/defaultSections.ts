import { Lead } from './models/Lead.js';
import { Section } from './models/Section.js';
import { getSettings } from './models/Settings.js';
import { reclassifyAll } from './services/reclassify.js';

/**
 * Sections created on first boot (see seedDefaultSections below). Edit
 * them in the UI afterwards; these values are only used once per database.
 *
 * How the three lists work together (details in services/score.ts):
 *   titleKeywords   — the job title names the role → lead qualifies
 *   keywords        — skills; without a role in the title, 3+ of these must appear
 *   excludeKeywords — the title names a different stack/role → lead is skipped,
 *                     unless the title also names one of `keywords`
 * All are whole-word, case-insensitive. Each section covers jobs and freelance.
 */
export const DEFAULT_SECTIONS = [
  {
    name: 'Dev · Node.js / Backend',
    color: '#4f8ef7',
    // One spelling per skill: "node" also matches "Node.js", "api" also matches "APIs",
    // so listing both would count one skill twice.
    titleKeywords: [
      'backend', 'back-end', 'back end', 'node', 'nodejs', 'full stack', 'full-stack', 'fullstack',
      'mern', 'typescript', 'javascript', 'api', 'platform engineer', 'integration engineer',
      'microservice', 'distributed systems', 'realtime', 'real-time', 'nestjs', 'express.js',
    ],
    keywords: [
      // runtime & language
      'node', 'nodejs', 'typescript', 'javascript', 'express.js', 'expressjs', 'nestjs', 'react',
      // APIs & realtime
      'rest api', 'restful', 'api', 'graphql', 'websocket', 'socket.io', 'mqtt', 'amqp', 'webhook',
      // architecture
      'microservice', 'distributed systems', 'system design', 'event-driven', 'event driven',
      'event sourcing', 'cqrs', 'soa', 'service-oriented', 'design pattern', 'oop', 'domain-driven',
      'ddd',
      // messaging, data, infra
      'rabbitmq', 'kafka', 'message queue', 'message broker', 'redis', 'postgresql', 'postgres',
      'mongodb', 'mongoose', 'mysql', 'docker', 'kubernetes', 'aws', 'ci/cd',
    ],
    excludeKeywords: [
      // other stacks
      'java', 'golang', 'rust', 'scala', 'kotlin', 'swift', 'c++', 'c#', '.net', 'php', 'laravel',
      'wordpress', 'magento', 'shopify', 'ruby', 'rails', 'python', 'django', 'elixir', 'salesforce',
      'sap', 'vue', 'angular', 'ios', 'android', 'flutter', 'embedded', 'firmware',
      // other roles
      'devops', 'sre', 'site reliability', 'data engineer', 'data scientist', 'data analyst',
      'analytics engineer', 'machine learning', 'ml engineer', 'qa', 'sdet', 'test engineer',
      'designer', 'security engineer', 'network engineer', 'support engineer', 'technical support',
      'cloud engineer', 'solutions engineer', 'sales', 'account executive', 'account manager',
      'recruiter',
    ],
    searchQueries: ['node.js', 'backend engineer', 'full stack typescript'],
  },
  {
    name: 'GTM · Product Marketing',
    color: '#e8a33d',
    titleKeywords: [
      'product marketing', 'product marketer', 'pmm', 'go-to-market', 'go to market', 'gtm',
      'growth marketing', 'growth marketer', 'head of growth', 'growth lead', 'growth manager',
      'marketing manager', 'marketing lead', 'head of marketing', 'marketing director',
      'director of marketing', 'vp marketing', 'vp of marketing', 'cmo', 'fractional cmo',
      'content marketing', 'demand generation', 'demand gen', 'lifecycle marketing',
      'b2b marketing', 'saas marketing', 'brand marketing', 'marketing strategist',
      'marketing consultant', 'solutions marketing', 'technical marketing', 'developer marketing',
      'developer relations', 'devrel', 'developer advocate', 'launch manager',
    ],
    // Specific GTM vocabulary only. Words like "marketing", "growth", "SaaS", "B2B" or
    // "conversion" appear in nearly every startup post and let sales/BD roles in.
    keywords: [
      'go-to-market', 'gtm', 'product marketing', 'positioning', 'messaging', 'value proposition',
      'product launch', 'launch plan', 'competitive analysis', 'competitive intelligence',
      'market research', 'customer research', 'customer interview', 'buyer persona', 'persona',
      'ideal customer profile', 'icp', 'segmentation', 'sales enablement', 'battlecard',
      'pricing and packaging', 'demand generation', 'demand gen', 'lead generation', 'plg',
      'product-led', 'content strategy', 'case studies', 'case study', 'a/b testing',
      'hubspot', 'seo', 'developer marketing', 'devrel', 'launch',
    ],
    excludeKeywords: [
      'account executive', 'account manager', 'sales development', 'sales representative', 'sdr',
      'bdr', 'inside sales', 'sales', 'business development', 'customer success',
      'customer support', 'recruiter', 'recruiting', 'accountant', 'accounting', 'paralegal',
      'engineer', 'engineering', 'data scientist', 'designer',
    ],
    searchQueries: ['product marketing', 'go-to-market', 'growth marketing'],
  },
];

/**
 * Adds DEFAULT_SECTIONS once per database, then files existing leads into them.
 * Never overwrites: a section that already has a default's name is left as is.
 * Replaces the old one-off "Freelance / Dev from settings.keywords" migration.
 */
export async function seedDefaultSections(): Promise<void> {
  const settings = await getSettings();
  if (settings.defaultSectionsSeeded) return;

  let order = await Section.countDocuments();
  for (const def of DEFAULT_SECTIONS) {
    const res = await Section.updateOne(
      { name: def.name },
      { $setOnInsert: { ...def, order } },
      { upsert: true },
    );
    if (res.upsertedCount > 0) {
      order++;
      console.log(`[leadforge] seeded section "${def.name}"`);
    }
  }
  settings.defaultSectionsSeeded = true;
  await settings.save();

  if ((await Lead.countDocuments()) > 0) {
    const result = await reclassifyAll();
    console.log(
      `[leadforge] classified ${result.scanned} existing leads (${result.moved} moved)`,
    );
  }
}
