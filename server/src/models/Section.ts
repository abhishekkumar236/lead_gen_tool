import mongoose, { Schema, type InferSchemaType } from 'mongoose';

/**
 * A named keyword rule that claims leads. Every lead belongs to at most one
 * section; leads matching no section keep `sectionId: null` and surface in the
 * UI as "Unsorted". Unsorted is deliberately NOT a document — a null foreign
 * key can't be renamed into a real section, deleted, or accidentally matched
 * against, and it keeps "this lead was never classified" honest in the data.
 */
const sectionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    keywords: { type: [String], default: [] },
    // Role names matched in the title only; see MatchRule in services/score.ts.
    titleKeywords: { type: [String], default: [] },
    // Title words that mean "not this kind of job".
    excludeKeywords: { type: [String], default: [] },
    // Phrases sent to sources that support search (Himalayas), e.g. "node.js".
    searchQueries: { type: [String], default: [] },
    color: { type: String, default: '#4f8ef7' },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

sectionSchema.index({ name: 1 }, { unique: true });

export type SectionDoc = InferSchemaType<typeof sectionSchema>;
export const Section = mongoose.model('Section', sectionSchema);
