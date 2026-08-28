import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { createApp } from '../src/app.js';
import { Lead } from '../src/models/Lead.js';
import { exportFilename } from '../src/services/exportExcel.js';
import { fakeFetch } from './fixtures/fixtures.js';

const app = createApp();
let mongod: MongoMemoryServer;
let devId = '';

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('leadforge-export'));
  vi.stubGlobal('fetch', fakeFetch);
  const sec = await request(app)
    .post('/api/sections')
    .send({ name: 'Dev', keywords: 'node, react, mongodb' });
  devId = sec.body.section._id;
  await request(app).post('/api/scrape').send({});
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await mongoose.disconnect();
  await mongod.stop();
});

async function parse(body: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(body as never);
  return wb;
}

describe('excel export', () => {
  it('returns a real xlsx with an attachment filename', async () => {
    const res = await request(app).get('/api/leads/export').buffer().parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="leadforge-.*\.xlsx"/);
    // A real xlsx is a zip — check the magic bytes rather than trusting the header.
    expect(res.body.subarray(0, 2).toString()).toBe('PK');
  });

  it('has one row per lead plus a header, and a summary sheet', async () => {
    const res = await request(app).get('/api/leads/export').buffer().parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    const wb = await parse(res.body);
    const sheet = wb.getWorksheet('Leads')!;
    expect(sheet).toBeTruthy();
    expect(sheet.rowCount - 1).toBe(await Lead.countDocuments());
    expect(sheet.getRow(1).getCell(1).value).toBe('Score');
    expect(sheet.getRow(1).getCell(2).value).toBe('Title');
    expect(wb.getWorksheet('Summary')).toBeTruthy();
  });

  it('honours the section scope and filters', async () => {
    const scoped = await request(app)
      .get(`/api/leads/export?section=${devId}`)
      .buffer()
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    const wb = await parse(scoped.body);
    const sheet = wb.getWorksheet('Leads')!;
    expect(sheet.rowCount - 1).toBe(await Lead.countDocuments({ sectionId: devId }));
    expect(scoped.headers['content-disposition']).toContain('leadforge-dev-');

    // Every data row should carry the section name, not another section's.
    const sectionCol = sheet.getColumn(4);
    const values = (sectionCol.values as unknown[]).slice(2);
    expect(values.every((v) => v === 'Dev')).toBe(true);
  });

  it('/export is routed before /:id and is not read as a lead id', async () => {
    const res = await request(app).get('/api/leads/export');
    expect(res.status).toBe(200); // a /:id match would 404 or 500 on a CastError
  });

  it('neutralises spreadsheet formula injection from scraped text', async () => {
    await Lead.create({
      source: 'hn',
      sourceId: 'formula-test',
      title: '=HYPERLINK("http://evil","click")',
      description: '+1+1',
      status: 'new',
    });
    const res = await request(app).get('/api/leads/export?q=HYPERLINK').buffer().parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    const wb = await parse(res.body);
    const sheet = wb.getWorksheet('Leads')!;
    const titles = (sheet.getColumn(2).values as unknown[]).slice(2).map(String);
    const injected = titles.find((t) => t.includes('HYPERLINK'));
    expect(injected).toBeTruthy();
    // Stored as literal text, never as a live formula.
    expect(injected!.startsWith('=')).toBe(false);
    await Lead.deleteOne({ sourceId: 'formula-test' });
  });
});

describe('exportFilename', () => {
  it('slugifies the scope and stamps the date', () => {
    expect(exportFilename('GTM / Marketing', new Date('2026-08-27T10:00:00Z')))
      .toBe('leadforge-gtm-marketing-2026-08-27.xlsx');
  });
  it('falls back when the scope has no usable characters', () => {
    expect(exportFilename('///', new Date('2026-08-27T10:00:00Z')))
      .toBe('leadforge-leads-2026-08-27.xlsx');
  });
});
