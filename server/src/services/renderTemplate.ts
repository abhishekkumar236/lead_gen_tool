interface RenderContext {
  [key: string]: string;
}

export function renderTemplate(text: string, ctx: RenderContext): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => ctx[key] ?? '');
}

export function buildContext(
  settings: {
    myName?: string;
    headline?: string;
    skills?: string[];
    portfolioUrl?: string;
    rate?: string;
  },
  lead: {
    title?: string;
    company?: string;
    source?: string;
    matchedKeywords?: string[];
    contactEmail?: string;
    url?: string;
  },
): RenderContext {
  return {
    myName: settings.myName ?? '',
    headline: settings.headline ?? '',
    skills: (settings.skills ?? []).join(', '),
    portfolioUrl: settings.portfolioUrl ?? '',
    rate: settings.rate ?? '',
    title: lead.title ?? '',
    company: lead.company || 'your team',
    source: lead.source ?? '',
    matchedKeywords: (lead.matchedKeywords ?? []).join(', '),
    contactEmail: lead.contactEmail ?? '',
    leadUrl: lead.url ?? '',
  };
}
