/**
 * The Leads page "Location" filter. Sources write location inconsistently
 * ("India, Singapore", "Anywhere in the World", "Worldwide", or nothing — HN
 * puts it in the post's first line, which becomes the title), so these are
 * whole-word regexes over `location` and `title`.
 *
 *   ncr   → Delhi NCR cities, in location or title
 *   india → India or an Indian city in location or title, or a location that
 *           says the job is open worldwide (you can take those from India)
 */
export const LOCATIONS = ['ncr', 'india'] as const;

const NCR = ['delhi', 'new delhi', 'ncr', 'gurgaon', 'gurugram', 'noida', 'greater noida', 'ghaziabad', 'faridabad'];
const INDIA = [
  'india', 'bangalore', 'bengaluru', 'mumbai', 'pune', 'hyderabad', 'chennai', 'kolkata',
  'ahmedabad', 'jaipur', 'chandigarh', 'kochi', 'indore', ...NCR,
];
// Location field only: in a title "Global" is usually a job name ("Global Partnerships Lead").
const WORLDWIDE = ['worldwide', 'anywhere', 'global'];

function words(list: string[]): RegExp {
  return new RegExp(`(?<![a-z])(${list.join('|')})(?![a-z])`, 'i');
}

const NCR_RE = words(NCR);
const INDIA_RE = words(INDIA);
const WORLDWIDE_RE = words(WORLDWIDE);

/** Mongo filter for `?location=`; `{}` when absent, `null` when the value is unknown. */
export function locationFilter(value?: string): Record<string, unknown> | null {
  if (!value) return {};
  if (value === 'ncr') return { $or: [{ location: NCR_RE }, { title: NCR_RE }] };
  if (value === 'india') {
    return { $or: [{ location: INDIA_RE }, { title: INDIA_RE }, { location: WORLDWIDE_RE }] };
  }
  return null;
}
