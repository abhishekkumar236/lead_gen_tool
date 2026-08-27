import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const templateSchema = new Schema(
  {
    name: { type: String, required: true },
    subject: { type: String, default: '' },
    body: { type: String, required: true },
  },
  { timestamps: true },
);

export type TemplateDoc = InferSchemaType<typeof templateSchema>;
export const Template = mongoose.model('Template', templateSchema);
