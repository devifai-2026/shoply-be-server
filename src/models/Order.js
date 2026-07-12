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
  gstRate:      { type: Number, default: 0 },   // % applied to this line at order time (snapshot)
  gstAmount:    { type: Number, default: 0 },   // ₹ tax for this line (price * quantity * gstRate/100)
  giftWrap: {
    selected: { type: Boolean, default: false },
    price:    { type: Number, default: 0 },     // snapshot of Product.giftWrap.price at order time
  },
  bundleOffer: {
    selected:     { type: Boolean, default: false },
    withProduct:  { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    bundlePrice:  { type: Number, default: null }, // snapshot combined price when accepted
  },
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
  giftWrapTotal: { type: Number, default: 0 },
  bundleSavings: { type: Number, default: 0 }, // discount realized from accepted bundle offers
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
    lat:     { type: Number, default: null }, // Places/Geocoding-verified coordinates
    lng:     { type: Number, default: null },
    placeId: { type: String, default: null }, // Google Places place_id, for audit/re-lookup
  },
  notes:    { type: String, default: '' },
  timeline: [timelineEventSchema],
  invoiceNumber: { type: String, default: null },
}, { timestamps: true });

orderSchema.index({ customer: 1 });
orderSchema.index({ status: 1, platform: 1 });
orderSchema.index({ createdAt: -1 });

// Default-connection model — the single shared `ecom.Order` collection,
// preserved for any request that doesn't resolve to a tenant subdomain.
const OrderDefault = mongoose.model('Order', orderSchema);

// Per-tenant-connection resolver. Each mongoose Connection keeps its own model
// registry, so registering 'Order' on a tenant connection never collides with
// the default connection's registration (OverwriteModelError only happens when
// re-registering on the SAME connection).
function getOrderModel(conn) {
  if (!conn) return OrderDefault;
  return conn.models.Order || conn.model('Order', orderSchema);
}

module.exports = OrderDefault;
module.exports.getOrderModel = getOrderModel;
