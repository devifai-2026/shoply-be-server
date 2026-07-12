require('dotenv').config();
const mongoose       = require('mongoose');
const connectDB      = require('./config/db');
const Admin          = require('./models/Admin');
const StoreSettings  = require('./models/StoreSettings');
const Appearance     = require('./models/Appearance');
const PaymentGateway = require('./models/PaymentGateway');
const Courier        = require('./models/Courier');
const ShippingZone   = require('./models/ShippingZone');

const seed = async () => {
  await connectDB();

  // Admin
  const existing = await Admin.findOne({ email: process.env.ADMIN_EMAIL });
  if (!existing) {
    await Admin.create({
      name:     'Super Admin',
      email:    process.env.ADMIN_EMAIL || 'admin@store.com',
      password: process.env.ADMIN_PASSWORD || 'Admin@123',
      role:     'superadmin',
    });
    console.log('✔  Admin created');
  }

  // Store Settings
  await StoreSettings.findOneAndUpdate({ storeId: 'default' }, { $setOnInsert: { storeId: 'default' } }, { upsert: true });
  console.log('✔  Store settings initialized');

  // Appearance
  await Appearance.findOneAndUpdate({ storeId: 'default' }, { $setOnInsert: { storeId: 'default' } }, { upsert: true });
  console.log('✔  Appearance initialized');

  // Payment Gateways
  const gateways = [
    { slug: 'cod',      name: 'Cash on Delivery',  type: 'Manual',        sortOrder: 0, isActive: true,  description: 'Pay when product is delivered', fields: [] },
    { slug: 'razorpay', name: 'Razorpay',           type: 'Aggregator',    sortOrder: 1, isActive: false, description: "India's #1 payment gateway",    fields: [{ label: 'Key ID', key: 'keyId', placeholder: 'rzp_live_...', isSecret: false }, { label: 'Key Secret', key: 'keySecret', placeholder: 'Enter key secret', isSecret: true }] },
    { slug: 'phonepe',  name: 'PhonePe Business',   type: 'UPI Wallet',    sortOrder: 2, isActive: false, description: 'UPI & wallet payments',         fields: [{ label: 'Merchant ID', key: 'merchantId', placeholder: 'PGTESTPAYUAT', isSecret: false }, { label: 'Salt Key', key: 'saltKey', placeholder: 'Enter salt key', isSecret: true }, { label: 'Salt Index', key: 'saltIndex', placeholder: '1', isSecret: false }] },
    { slug: 'paytm',    name: 'Paytm for Business', type: 'UPI Wallet',    sortOrder: 3, isActive: false, description: 'UPI, wallet, cards & net banking', fields: [{ label: 'MID', key: 'mid', placeholder: 'Enter merchant ID', isSecret: false }, { label: 'Merchant Key', key: 'merchantKey', placeholder: 'Enter key', isSecret: true }] },
    { slug: 'cashfree', name: 'Cashfree Payments',  type: 'Aggregator',    sortOrder: 4, isActive: false, description: 'Fast settlements',              fields: [{ label: 'App ID', key: 'appId', placeholder: 'Enter App ID', isSecret: false }, { label: 'Secret Key', key: 'secretKey', placeholder: 'Enter secret', isSecret: true }] },
    { slug: 'stripe',   name: 'Stripe',             type: 'International', sortOrder: 5, isActive: false, description: 'International card payments',   fields: [{ label: 'Publishable Key', key: 'pubKey', placeholder: 'pk_live_...', isSecret: false }, { label: 'Secret Key', key: 'secretKey', placeholder: 'sk_live_...', isSecret: true }] },
    { slug: 'payu',     name: 'PayU',               type: 'Aggregator',    sortOrder: 6, isActive: false, description: 'Credit/debit cards, UPI & net banking via PayU', fields: [{ label: 'Merchant Key', key: 'merchantKey', placeholder: 'Enter merchant key', isSecret: false }, { label: 'Salt', key: 'salt', placeholder: 'Enter salt', isSecret: true }] },
  ];
  for (const g of gateways) {
    // $set updates metadata; $setOnInsert preserves existing credentials on re-seed
    const { slug, isActive, sandboxMode, fields, ...meta } = g;
    await PaymentGateway.findOneAndUpdate(
      { slug },
      { $set: meta, $setOnInsert: { isActive, sandboxMode: sandboxMode ?? true, fields } },
      { upsert: true }
    );
  }
  console.log('✔  Payment gateways seeded');

  // Couriers
  const couriers = [
    { slug: 'delhivery',  name: 'Delhivery',    isActive: true  },
    { slug: 'shiprocket', name: 'Shiprocket',   isActive: true  },
    { slug: 'bluedart',   name: 'Blue Dart',    isActive: false },
    { slug: 'dtdc',       name: 'DTDC Express', isActive: false },
  ];
  for (const c of couriers) {
    await Courier.findOneAndUpdate({ slug: c.slug }, c, { upsert: true });
  }
  console.log('✔  Couriers seeded');

  // Shipping Zones
  const zones = [
    { name: 'Metro Cities',  coverageArea: 'Delhi, Mumbai, Bengaluru, Chennai, Hyderabad, Pune', baseRate: 49,  freeAbove: 499,  estimatedDays: '1-2 Days', sortOrder: 0 },
    { name: 'Tier-2 Cities', coverageArea: 'Jaipur, Lucknow, Surat, Ahmedabad, Kochi & more',   baseRate: 79,  freeAbove: 799,  estimatedDays: '3-4 Days', sortOrder: 1 },
    { name: 'Pan India',     coverageArea: 'All remaining pin codes across India',               baseRate: 99,  freeAbove: 999,  estimatedDays: '4-7 Days', sortOrder: 2 },
    { name: 'Remote Areas',  coverageArea: 'J&K, North-East, Andaman & remote pin codes',       baseRate: 149, freeAbove: 1499, estimatedDays: '7-10 Days', sortOrder: 3 },
  ];
  for (const z of zones) {
    await ShippingZone.findOneAndUpdate({ name: z.name }, z, { upsert: true });
  }
  console.log('✔  Shipping zones seeded');

  console.log('\n🎉 Seed complete!');
  await mongoose.disconnect();
};

seed().catch(err => { console.error(err); process.exit(1); });
