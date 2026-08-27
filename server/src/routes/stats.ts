import { Router } from 'express';
import { Lead } from '../models/Lead.js';

export const statsRouter = Router();

statsRouter.get('/', async (_req, res) => {
  const [byStatus, bySource, followUpsDue, topNew] = await Promise.all([
    Lead.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Lead.aggregate([{ $group: { _id: '$source', count: { $sum: 1 } } }]),
    Lead.find({
      followUpAt: { $ne: null, $lte: new Date() },
      status: { $nin: ['won', 'lost', 'archived'] },
    })
      .sort('followUpAt')
      .limit(20),
    Lead.find({ status: 'new' }).sort('-score').limit(5),
  ]);
  res.json({
    byStatus: Object.fromEntries(byStatus.map((r) => [r._id, r.count])),
    bySource: Object.fromEntries(bySource.map((r) => [r._id, r.count])),
    followUpsDue,
    topNew,
  });
});
