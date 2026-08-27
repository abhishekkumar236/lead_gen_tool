import type { LeadSource, LeadStatus } from '../types';
import { SOURCE_LABELS, STATUS_LABELS } from '../types';

export function ScoreBadge({ score }: { score: number }) {
  const tier = score >= 60 ? 'hot' : score >= 35 ? 'warm' : 'cold';
  return <span className={`score score-${tier}`}>{score}</span>;
}

export function StatusPill({ status }: { status: LeadStatus }) {
  return <span className={`pill pill-${status}`}>{STATUS_LABELS[status]}</span>;
}

export function SourceTag({ source }: { source: LeadSource }) {
  return <span className={`source source-${source}`}>{SOURCE_LABELS[source]}</span>;
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
