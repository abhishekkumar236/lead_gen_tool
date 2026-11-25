// Minimal helpers for the RSS/Atom feeds (Reddit, We Work Remotely). Regex is
// enough: we read a handful of flat tags, never nested structure.

export function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#x27;/g, "'")
    .replace(/&#32;/g, ' ')
    .replace(/&#x2F;/g, '/')
    .replace(/&amp;/g, '&');
}

/** Text of the first <name>…</name> in `entry`, entities decoded. */
export function tag(entry: string, name: string): string {
  const m = entry.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decodeXmlEntities(m[1]).trim() : '';
}
