const Visit = require('../models/Visit');

const getDateRange = (period = '30d') => {
  const end   = new Date();
  const start = new Date();
  const map   = { '1d': 1, '7d': 7, '30d': 30, '90d': 90 };
  start.setDate(start.getDate() - (map[period] || 30));
  return { start, end };
};

exports.getSummary = async (req, res, next) => {
  try {
    const { start, end } = getDateRange(req.query.period);
    const match = { createdAt: { $gte: start, $lte: end } };

    const [uniqueVisitors, totalPageViews, topCountries, topProducts, platformSplit] = await Promise.all([
      Visit.distinct('visitorId', match).then(a => a.length),
      Visit.countDocuments({ ...match, eventType: 'page_view' }),
      Visit.aggregate([
        { $match: { ...match, 'geo.country': { $ne: null } } },
        { $group: { _id: '$geo.country', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
      Visit.aggregate([
        { $match: { ...match, product: { $ne: null }, eventType: { $in: ['product_view', 'product_click'] } } },
        { $lookup: { from: 'products', localField: 'product', foreignField: '_id', as: 'productDoc' } },
        { $unwind: '$productDoc' },
        { $group: { _id: '$product', name: { $first: '$productDoc.name' }, views: { $sum: { $cond: [{ $eq: ['$eventType', 'product_view'] }, 1, 0] } }, clicks: { $sum: { $cond: [{ $eq: ['$eventType', 'product_click'] }, 1, 0] } } } },
        { $sort: { views: -1, clicks: -1 } },
        { $limit: 10 },
      ]),
      Visit.aggregate([
        { $match: match },
        { $group: { _id: '$platform', count: { $sum: 1 } } },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        uniqueVisitors,
        totalPageViews,
        topCountries: topCountries.map(c => ({ country: c._id, count: c.count })),
        topProducts,
        platformSplit: platformSplit.map(p => ({ platform: p._id, count: p.count })),
        period: req.query.period || '30d',
      },
    });
  } catch (err) { next(err); }
};

exports.listVisits = async (req, res, next) => {
  try {
    const { start, end } = getDateRange(req.query.period || '7d');
    const page  = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const filter = { createdAt: { $gte: start, $lte: end } };
    if (req.query.platform)  filter.platform  = req.query.platform;
    if (req.query.eventType) filter.eventType = req.query.eventType;
    if (req.query.country)   filter['geo.country'] = req.query.country;

    const [visits, total] = await Promise.all([
      Visit.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('product', 'name')
        .populate('customer', 'name email')
        .lean(),
      Visit.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: visits,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) { next(err); }
};

exports.getMapPoints = async (req, res, next) => {
  try {
    const { start, end } = getDateRange(req.query.period || '30d');

    const points = await Visit.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end }, 'geo.lat': { $ne: null }, 'geo.lng': { $ne: null } } },
      {
        $group: {
          _id:     { lat: { $round: ['$geo.lat', 1] }, lng: { $round: ['$geo.lng', 1] } },
          city:    { $first: '$geo.city' },
          region:  { $first: '$geo.region' },
          country: { $first: '$geo.country' },
          count:   { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 500 },
    ]);

    res.json({
      success: true,
      data: points.map(p => ({
        lat: p._id.lat, lng: p._id.lng,
        city: p.city, region: p.region, country: p.country,
        count: p.count,
      })),
    });
  } catch (err) { next(err); }
};

exports.getLiveVisitors = async (req, res, next) => {
  try {
    const since = new Date(Date.now() - 5 * 60 * 1000);
    const match = { createdAt: { $gte: since } };

    const [liveVisitorIds, points] = await Promise.all([
      Visit.distinct('visitorId', match),
      Visit.aggregate([
        { $match: { ...match, 'geo.lat': { $ne: null }, 'geo.lng': { $ne: null } } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: '$visitorId', lat: { $first: '$geo.lat' }, lng: { $first: '$geo.lng' }, city: { $first: '$geo.city' }, region: { $first: '$geo.region' }, country: { $first: '$geo.country' }, path: { $first: '$path' } } },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        count: liveVisitorIds.length,
        points: points.map(p => ({ lat: p.lat, lng: p.lng, city: p.city, region: p.region, country: p.country, path: p.path })),
      },
    });
  } catch (err) { next(err); }
};
