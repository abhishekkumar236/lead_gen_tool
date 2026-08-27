import mongoose, { Schema, type InferSchemaType } from 'mongoose';

// Single-document collection: the freelancer's own profile, used for
// lead scoring (keywords) and pitch rendering (name/skills/portfolio/rate).
const settingsSchema = new Schema(
  {
    singleton: { type: String, default: 'settings', unique: true },
    myName: { type: String, default: '' },
    headline: { type: String, default: '' },
    skills: { type: [String], default: [] },
    keywords: {
      type: [String],
      default: [
        'node',
        'nodejs',
        'typescript',
        'javascript',
        'react',
        'mern',
        'express',
        'mongodb',
        'backend',
        'full stack',
        'fullstack',
        'api',
        'aws',
      ],
    },
    portfolioUrl: { type: String, default: '' },
    rate: { type: String, default: '' },
  },
  { timestamps: true },
);

export type SettingsDoc = InferSchemaType<typeof settingsSchema>;
export const Settings = mongoose.model('Settings', settingsSchema);

export async function getSettings() {
  return Settings.findOneAndUpdate(
    { singleton: 'settings' },
    { $setOnInsert: {} },
    { new: true, upsert: true },
  );
}
