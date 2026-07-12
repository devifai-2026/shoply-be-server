const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const addressSchema = new mongoose.Schema({
  label:    { type: String, default: 'Home' },
  name:     String,
  phone:    {
    type: String,
    validate: {
      validator: v => !v || /^[6-9]\d{9}$/.test(v),
      message: 'Phone must be a valid 10-digit Indian mobile number',
    },
  },
  line1:    String,
  line2:    String,
  city:     String,
  state:    String,
  pincode:  {
    type: String,
    validate: {
      validator: v => !v || /^[1-9]\d{5}$/.test(v),
      message: 'Pincode must be a valid 6-digit Indian PIN code',
    },
  },
  country:  { type: String, default: 'India' },
  isDefault: { type: Boolean, default: false },
  // Populated when the address was selected/verified via Google Places
  // Autocomplete or "use current location" — absent for plain manual entry.
  lat:     { type: Number, default: null },
  lng:     { type: Number, default: null },
  placeId: { type: String, default: null },
}, { _id: true });

const customerSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, 'Name is required'], 
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  email: { 
    type: String, 
    required: [true, 'Email is required'], 
    unique: true, 
    lowercase: true, 
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please fill a valid email address']
  },
  phone: { 
    type: String, 
    default: '',
    trim: true
  },
  avatar: { 
    type: String, 
    default: null 
  },
  password: { 
    type: String, 
    required: function() { return !this.socialLogin; },
    minlength: [6, 'Password must be at least 6 characters'], 
    select: false 
  },
  platform: { 
    type: String, 
    enum: ['Web', 'App', 'Both'], 
    default: 'Web' 
  },
  type: { 
    type: String, 
    enum: ['new', 'returning', 'blocked'], 
    default: 'new' 
  },
  status: { 
    type: String, 
    enum: ['active', 'blocked'], 
    default: 'active' 
  },
  addresses: [addressSchema],
  orderCount: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 },
  lastOrderAt: { type: Date, default: null },
  fcmToken: { type: String, default: null },
  deviceType: { type: String, enum: ['android', 'ios', 'web', null], default: null },
  webPushSubscription: { type: mongoose.Schema.Types.Mixed, default: null },
  socialLogin: { type: String, enum: ['google', 'facebook', 'apple', null], default: null },
  notes: { type: String, default: '' },
  wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  resetPasswordToken: String,
  resetPasswordExpire: Date,
}, { timestamps: true });

customerSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

customerSchema.methods.matchPassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

customerSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.resetPasswordToken;
  delete obj.resetPasswordExpire;
  return obj;
};

customerSchema.index({ phone: 1 });
customerSchema.index({ status: 1, type: 1 });
customerSchema.index({ name: 'text', email: 'text', phone: 'text' });

// Default-connection model — the single shared `ecom.Customer` collection,
// preserved for any request that doesn't resolve to a tenant subdomain.
const CustomerDefault = mongoose.model('Customer', customerSchema);

// Per-tenant-connection resolver. Each mongoose Connection keeps its own model
// registry, so registering 'Customer' on a tenant connection never collides with
// the default connection's registration (OverwriteModelError only happens when
// re-registering on the SAME connection).
function getCustomerModel(conn) {
  if (!conn) return CustomerDefault;
  return conn.models.Customer || conn.model('Customer', customerSchema);
}

module.exports = CustomerDefault;
module.exports.getCustomerModel = getCustomerModel;
