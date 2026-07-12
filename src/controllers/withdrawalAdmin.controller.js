const { getWithdrawalRequestModel } = require('../models/WithdrawalRequest');
const { getVendorModel } = require('../models/Vendor');

exports.list = async (req, res, next) => {
  try {
    const WithdrawalRequest = getWithdrawalRequestModel(req.tenantConn);
    const filter = {};
    if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
    if (req.query.vendor) filter.vendor = req.query.vendor;

    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      WithdrawalRequest.find(filter)
        .populate('vendor', 'storeName name email bankDetails')
        .sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      WithdrawalRequest.countDocuments(filter),
    ]);
    res.json({ success: true, data: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
};

exports.markPaid = async (req, res, next) => {
  try {
    const WithdrawalRequest = getWithdrawalRequestModel(req.tenantConn);
    const Vendor            = getVendorModel(req.tenantConn);
    const { paymentReference } = req.body;
    if (!paymentReference) {
      return res.status(400).json({ success: false, message: 'Payment reference is required' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Screenshot is required' });
    }

    const screenshotUrl = `/uploads/payouts/${req.file.filename}`;
    const request = await WithdrawalRequest.findOneAndUpdate(
      { _id: req.params.id, status: 'pending' },
      { status: 'paid', processedAt: new Date(), paymentReference, screenshotUrl },
      { new: true },
    );
    if (!request) {
      return res.status(409).json({ success: false, message: 'Request already processed or not found' });
    }

    await Vendor.findByIdAndUpdate(request.vendor, { $inc: { totalWithdrawn: request.amount } });
    res.json({ success: true, data: request, message: 'Marked as paid' });
  } catch (err) { next(err); }
};

exports.reject = async (req, res, next) => {
  try {
    const WithdrawalRequest = getWithdrawalRequestModel(req.tenantConn);
    const request = await WithdrawalRequest.findOneAndUpdate(
      { _id: req.params.id, status: 'pending' },
      { status: 'rejected', adminNote: req.body?.reason || '', processedAt: new Date() },
      { new: true },
    );
    if (!request) {
      return res.status(409).json({ success: false, message: 'Request already processed or not found' });
    }
    res.json({ success: true, data: request, message: 'Withdrawal request rejected' });
  } catch (err) { next(err); }
};
