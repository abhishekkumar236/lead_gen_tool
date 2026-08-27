import mongoose, { Schema, type InferSchemaType } from 'mongoose';

export const LEAD_STATUSES = [
  'new',
  'shortlisted',
  'pitched',
  'replied',
  'won',
  'lost',
  'archived',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_SOURCES = ['hn', 'reddit', 'remoteok', 'remotive'] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

const noteSchema = new Schema(
  {
    text: { type: String, required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const leadSchema = new Schema(
  {
    source: { type: String, enum: LEAD_SOURCES, required: true },
    sourceId: { type: String, required: true },
    title: { type: String, required: true },
    // Set when the user renames a lead, so re-scrapes stop overwriting the title.
    titleEdited: { type: Boolean, default: false },
    company: { type: String, default: '' },
    description: { type: String, default: '' },
    url: { type: String, default: '' },
    contactEmail: { type: String, default: '' },
    emails: { type: [String], default: [] },
    location: { type: String, default: '' },
    tags: { type: [String], default: [] },
    budgetText: { type: String, default: '' },
    score: { type: Number, default: 0 },
    matchedKeywords: { type: [String], default: [] },
    status: { type: String, enum: LEAD_STATUSES, default: 'new' },
    notes: { type: [noteSchema], default: [] },
    followUpAt: { type: Date, default: null },
    pitchedAt: { type: Date, default: null },
    postedAt: { type: Date, default: null },
    scrapedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

leadSchema.index({ source: 1, sourceId: 1 }, { unique: true });
leadSchema.index({ status: 1, score: -1 });
leadSchema.index({ title: 'text', description: 'text', company: 'text' });

export type LeadDoc = InferSchemaType<typeof leadSchema>;
export const Lead = mongoose.model('Lead', leadSchema);
