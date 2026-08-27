import { resolveMx } from 'node:dns/promises';

export interface EmailGuessResult {
  domain: string;
  domainAcceptsMail: boolean;
  guesses: string[];
}

export function generatePatterns(firstName: string, lastName: string, domain: string): string[] {
  const f = firstName.trim().toLowerCase().replace(/[^a-z]/g, '');
  const l = lastName.trim().toLowerCase().replace(/[^a-z]/g, '');
  const d = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  if (!f || !d) return [];
  const patterns = new Set<string>();
  patterns.add(`${f}@${d}`);
  if (l) {
    patterns.add(`${f}.${l}@${d}`);
    patterns.add(`${f}${l}@${d}`);
    patterns.add(`${f[0]}${l}@${d}`);
    patterns.add(`${f}.${l[0]}@${d}`);
    patterns.add(`${f}_${l}@${d}`);
    patterns.add(`${l}.${f}@${d}`);
  }
  patterns.add(`hello@${d}`);
  patterns.add(`contact@${d}`);
  return [...patterns];
}

export async function checkMx(domain: string): Promise<boolean> {
  const d = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  try {
    const records = await resolveMx(d);
    return records.length > 0;
  } catch {
    return false;
  }
}

export async function guessEmails(
  firstName: string,
  lastName: string,
  domain: string,
): Promise<EmailGuessResult> {
  const guesses = generatePatterns(firstName, lastName, domain);
  const cleanDomain = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  const domainAcceptsMail = guesses.length > 0 ? await checkMx(cleanDomain) : false;
  return { domain: cleanDomain, domainAcceptsMail, guesses };
}
