import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const templateSchema = new Schema(
  {
    name: { type: String, required: true },
    subject: { type: String, default: '' },
    body: { type: String, required: true },
    // null = shared across every section. A section-scoped template only shows
    // up while that section is active.
    sectionId: { type: Schema.Types.ObjectId, ref: 'Section', default: null },
  },
  { timestamps: true },
);

export type TemplateDoc = InferSchemaType<typeof templateSchema>;
export const Template = mongoose.model('Template', templateSchema);
