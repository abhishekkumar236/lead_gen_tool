const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Obfuscations people use in HN/Reddit posts: "name [at] domain [dot] com"
const OBFUSCATED_RE =
  /([a-zA-Z0-9._%+-]+)\s*(?:\[at\]|\(at\)|\s@\s|\bat\b)\s*([a-zA-Z0-9-]+)\s*(?:\[dot\]|\(dot\)|\bdot\b)\s*([a-zA-Z]{2,})/gi;

/**
 * A local part starting with punctuation means the regex bit into the middle of
 * something else — usually a template placeholder like `<fname>.<lname>+hn@x.com`
 * — so the captured fragment is not a real address.
 */
export function isPlausible(email: string): boolean {
  const [local, domain] = email.split('@');
  if (!local || !domain) return false;
  if (/^[.+\-_]/.test(local) || /[.+\-_]$/.test(local)) return false;
  if (/^[.\-]/.test(domain) || domain.includes('..')) return false;
  // Image/asset filenames sometimes look like addresses after HTML stripping.
  if (/\.(png|jpe?g|gif|svg|webp|css|js)$/i.test(domain)) return false;
  return true;
}

export function extractEmails(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(EMAIL_RE)) {
    // Strip trailing punctuation a sentence may glue on.
    const email = m[0].replace(/[.,;:]+$/, '').toLowerCase();
    if (isPlausible(email)) found.add(email);
  }
  for (const m of text.matchAll(OBFUSCATED_RE)) {
    found.add(`${m[1]}@${m[2]}.${m[3]}`.toLowerCase());
  }
  return [...found];
}

const BUDGET_RE =
  /(?:[$€£₹]\s?\d[\d,.]*\s*(?:k|K)?(?:\s*[-–]\s*[$€£₹]?\s?\d[\d,.]*\s*(?:k|K)?)?(?:\s*\/\s*(?:hr|hour|mo|month|week|wk|day|yr|year))?|\d[\d,.]*\s*(?:USD|EUR|INR|GBP)\b|\d+\s*\/\s*(?:hr|hour)\b)/;

export function extractBudget(text: string): string {
  const m = text.match(BUDGET_RE);
  return m ? m[0].trim() : '';
}

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    // HN comments read "Header<p>body…" with no closing tag on the first block,
    // so breaking only on </p> would weld the title onto the body text.
    .replace(/<p[^>]*>/gi, '\n\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/(div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
