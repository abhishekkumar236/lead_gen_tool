import { Router } from 'express';
import { Lead } from '../models/Lead.js';
import { sectionFilter } from './leads.js';

export const statsRouter = Router();

statsRouter.get('/', async (req, res) => {
  const scope = sectionFilter((req.query as Record<string, string>).section);
  const match = Object.keys(scope).length > 0 ? [{ $match: scope }] : [];
  const [byStatus, bySource, followUpsDue, topNew] = await Promise.all([
    Lead.aggregate([...match, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Lead.aggregate([...match, { $group: { _id: '$source', count: { $sum: 1 } } }]),
    Lead.find({
      ...scope,
      followUpAt: { $ne: null, $lte: new Date() },
      status: { $nin: ['won', 'lost', 'archived'] },
    })
      .sort('followUpAt')
      .limit(20),
    Lead.find({ ...scope, status: 'new' }).sort('-score').limit(5),
  ]);
  res.json({
    byStatus: Object.fromEntries(byStatus.map((r) => [r._id, r.count])),
    bySource: Object.fromEntries(bySource.map((r) => [r._id, r.count])),
    followUpsDue,
    topNew,
  });
});
