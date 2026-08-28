import ExcelJS from 'exceljs';

export interface ExportLead {
  score?: number;
  title?: string;
  company?: string;
  source?: string;
  status?: string;
  contactEmail?: string;
  budgetText?: string;
  location?: string;
  url?: string;
  matchedKeywords?: string[];
  notes?: { text: string; at: Date | string }[];
  description?: string;
  postedAt?: Date | null;
  followUpAt?: Date | null;
  pitchedAt?: Date | null;
  sectionId?: unknown;
}

const COLUMNS: Array<{ header: string; key: string; width: number }> = [
  { header: 'Score', key: 'score', width: 8 },
  { header: 'Title', key: 'title', width: 52 },
  { header: 'Company', key: 'company', width: 22 },
  { header: 'Section', key: 'section', width: 18 },
  { header: 'Source', key: 'source', width: 12 },
  { header: 'Status', key: 'status', width: 13 },
  { header: 'Contact email', key: 'contactEmail', width: 30 },
  { header: 'Budget', key: 'budgetText', width: 18 },
  { header: 'Location', key: 'location', width: 22 },
  { header: 'Posted', key: 'postedAt', width: 12 },
  { header: 'Follow up', key: 'followUpAt', width: 12 },
  { header: 'Pitched', key: 'pitchedAt', width: 12 },
  { header: 'Keywords', key: 'matchedKeywords', width: 26 },
  { header: 'Link', key: 'url', width: 44 },
  { header: 'Notes', key: 'notes', width: 40 },
  { header: 'Post body', key: 'description', width: 80 },
];

/**
 * Excel treats a leading =, +, - or @ as a formula. Lead text is scraped from
 * the open internet, so a title like "=Senior Dev" would render as a broken
 * formula (or worse). Prefixing with an apostrophe forces Excel to read it as
 * literal text; the apostrophe itself isn't part of the value.
 */
function safeText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function buildWorkbook(
  leads: ExportLead[],
  sectionNames: Map<string, string>,
  scopeLabel: string,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'LeadForge';
  wb.created = new Date();

  const sheet = wb.addWorksheet('Leads', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = COLUMNS;

  for (const lead of leads) {
    const row = sheet.addRow({
      score: lead.score ?? 0,
      title: safeText(lead.title ?? ''),
      company: safeText(lead.company ?? ''),
      section: lead.sectionId ? (sectionNames.get(String(lead.sectionId)) ?? '—') : 'Unsorted',
      source: lead.source ?? '',
      status: lead.status ?? '',
      contactEmail: lead.contactEmail ?? '',
      budgetText: safeText(lead.budgetText ?? ''),
      location: safeText(lead.location ?? ''),
      postedAt: asDate(lead.postedAt),
      followUpAt: asDate(lead.followUpAt),
      pitchedAt: asDate(lead.pitchedAt),
      matchedKeywords: (lead.matchedKeywords ?? []).join(', '),
      url: lead.url ?? '',
      notes: (lead.notes ?? []).map((n) => n.text).join('\n'),
      description: safeText(lead.description ?? ''),
    });

    for (const key of ['postedAt', 'followUpAt', 'pitchedAt']) {
      row.getCell(key).numFmt = 'dd mmm yyyy';
    }
    // Colour the score like the UI's badges so a scan of the sheet reads the same.
    const score = lead.score ?? 0;
    row.getCell('score').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: score >= 60 ? 'FFF2564B' : score >= 35 ? 'FFE8A33D' : 'FF5C6B7D' },
    };
    row.getCell('score').font = { color: { argb: 'FFFFFFFF' }, bold: true };
    row.getCell('score').alignment = { horizontal: 'center' };

    if (lead.url) {
      row.getCell('url').value = { text: lead.url, hyperlink: lead.url };
      row.getCell('url').font = { color: { argb: 'FF4F8EF7' }, underline: true };
    }
    row.getCell('description').alignment = { wrapText: false, vertical: 'top' };
    row.getCell('notes').alignment = { wrapText: false, vertical: 'top' };
  }

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E242C' } };
  header.height = 20;
  header.alignment = { vertical: 'middle' };
  sheet.autoFilter = { from: 'A1', to: { row: 1, column: COLUMNS.length } };

  // ── summary sheet ──
  const summary = wb.addWorksheet('Summary');
  summary.columns = [
    { header: 'Metric', key: 'k', width: 26 },
    { header: 'Value', key: 'v', width: 16 },
  ];
  summary.getRow(1).font = { bold: true };
  summary.addRow({ k: 'Exported', v: new Date() }).getCell('v').numFmt = 'dd mmm yyyy hh:mm';
  summary.addRow({ k: 'Scope', v: scopeLabel });
  summary.addRow({ k: 'Total leads', v: leads.length });
  summary.addRow({});

  const tally = (get: (l: ExportLead) => string) => {
    const counts = new Map<string, number>();
    for (const l of leads) counts.set(get(l), (counts.get(get(l)) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  };

  summary.addRow({ k: 'BY STATUS' }).font = { bold: true };
  for (const [k, v] of tally((l) => l.status ?? '—')) summary.addRow({ k, v });
  summary.addRow({});
  summary.addRow({ k: 'BY SECTION' }).font = { bold: true };
  for (const [k, v] of tally((l) =>
    l.sectionId ? (sectionNames.get(String(l.sectionId)) ?? '—') : 'Unsorted',
  )) {
    summary.addRow({ k, v });
  }
  summary.addRow({});
  summary.addRow({ k: 'BY SOURCE' }).font = { bold: true };
  for (const [k, v] of tally((l) => l.source ?? '—')) summary.addRow({ k, v });

  // exceljs declares its own Buffer-like type; normalise it to a Node Buffer.
  const data = await wb.xlsx.writeBuffer();
  return Buffer.from(data as unknown as ArrayBuffer);
}

/** leadforge-gtm-marketing-2026-08-27.xlsx */
export function exportFilename(scopeLabel: string, now = new Date()): string {
  const slug = scopeLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'leads';
  return `leadforge-${slug}-${now.toISOString().slice(0, 10)}.xlsx`;
}
