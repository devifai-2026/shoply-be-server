const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product:      { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name:         { type: String, required: true },
  sku:          { type: String, required: true },
  image:        { type: String, default: null },
  quantity:     { type: Number, required: true, min: 1 },
  price:        { type: Number, required: true },
  discountPrice: { type: Number, default: null },
  attributes:   { type: Map, of: String, default: {} },
}, { _id: true });

const timelineEventSchema = new mongoose.Schema({
  status:    { type: String, required: true },
  note:      { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderNumber:  { type: String, required: true, unique: true },
  customer:     { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  items:        [orderItemSchema],
  subtotal:     { type: Number, required: true },
  shippingCost: { type: Number, default: 0 },
  discount:     { type: Number, default: 0 },
  tax:          { type: Number, default: 0 },
  total:        { type: Number, required: true },
  couponCode:   { type: String, default: null },
  platform:     { type: String, enum: ['Web', 'App'], default: 'Web' },
  status:       {
    type: String,
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'],
    default: 'pending',
  },
  paymentMethod:   { type: String, default: 'cod' },
  paymentStatus:   { type: String, enum: ['unpaid', 'paid', 'refunded'], default: 'unpaid' },
  transactionId:   { type: String, default: null },
  paymentDetails:  { type: mongoose.Schema.Types.Mixed, default: {} },
  trackingNumber: { type: String, default: null },
  courierName:    { type: String, default: null },
  courierSlug:    { type: String, default: null },   // 'shiprocket' | 'delhivery'
  shipmentId:     { type: String, default: null },   // courier-internal shipment ID
  awbCode:        { type: String, default: null },   // Air Waybill / waybill number
  shippingAddress: {
    name:    { type: String },
    phone:   { type: String },
    line1:   { type: String },
    line2:   { type: String },
    city:    { type: String },
    state:   { type: String },
    pincode: { type: String },
    country: { type: String, default: 'India' },
  },
  notes:    { type: String, default: '' },
  timeline: [timelineEventSchema],
  invoiceNumber: { type: String, default: null },
}, { timestamps: true });

orderSchema.index({ customer: 1 });
orderSchema.index({ status: 1, platform: 1 });
orderSchema.index({ createdAt: -1 });
module.exports = mongoose.model('Order', orderSchema);
