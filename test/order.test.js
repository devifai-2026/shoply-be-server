const request = require('supertest');
const app = require('../src/app');
const Customer = require('../src/models/Customer');
const Vendor = require('../src/models/Vendor');
const Category = require('../src/models/Category');
const Product = require('../src/models/Product');
const ShippingZone = require('../src/models/ShippingZone');
const StoreSettings = require('../src/models/StoreSettings');
const SubOrder = require('../src/models/SubOrder');
const { customerToken } = require('./helpers');

describe('Order creation', () => {
  let customer, token, category, vendor, mainProduct, companionProduct;

  beforeEach(async () => {
    customer = await Customer.create({ name: 'Test Customer', email: 'order-test@example.com', password: 'password123' });
    token = customerToken(customer._id);
    category = await Category.create({ name: 'Books', slug: 'books' });
    vendor = await Vendor.create({
      name: 'Test Vendor', email: 'order-vendor@example.com', password: 'password123',
      storeName: 'Test Vendor Store', slug: 'test-vendor-store', status: 'approved',
      commissionRate: 10,
      shippingSettings: { useCustomRates: true, flatRate: 60, freeAbove: 999 },
    });
    mainProduct = await Product.create({
      name: 'Main Product', category: category._id, vendor: vendor._id, sku: 'ORD-MAIN-1',
      price: 500, stock: 30, gstRate: 12,
      giftWrap: { enabled: true, price: 49 },
    });
    companionProduct = await Product.create({
      name: 'Companion Product', category: category._id, vendor: vendor._id, sku: 'ORD-COMP-1',
      price: 150, stock: 50,
    });
    await Product.findByIdAndUpdate(mainProduct._id, {
      bundleOffer: { enabled: true, withProduct: companionProduct._id, bundlePrice: 600 },
    });
    mainProduct = await Product.findById(mainProduct._id);

    await ShippingZone.create({ name: 'Fallback', coverageArea: 'All', baseRate: 40, isActive: true, sortOrder: 0 });
    await StoreSettings.create({ storeId: 'default' }); // gstRate: 18 default, used by companion product
  });

  const shippingAddress = {
    name: 'Test User', phone: '9876543210', line1: '123 Test St', city: 'Kolkata', state: 'WB', pincode: '700001',
  };

  it('computes per-product GST, gift wrap, bundle savings, and vendor shipping correctly', async () => {
    const res = await request(app).post('/api/customer/orders').set('Authorization', `Bearer ${token}`).send({
      items: [
        {
          product: mainProduct._id, quantity: 1,
          giftWrap: { selected: true },
          bundleOffer: { selected: true, withProduct: companionProduct._id },
        },
        { product: companionProduct._id, quantity: 1 },
      ],
      shippingAddress,
      paymentMethod: 'cod',
    });

    expect(res.status).toBe(201);
    const order = res.body.data;

    expect(order.subtotal).toBe(650); // 500 + 150
    expect(order.tax).toBe(87); // main: 12% of 500 = 60; companion: 18% (store default) of 150 = 27
    expect(order.giftWrapTotal).toBe(49);
    expect(order.bundleSavings).toBe(50); // (500+150) - 600
    expect(order.shippingCost).toBe(60); // vendor custom flat rate, subtotal 650 < freeAbove 999
    expect(order.total).toBe(650 + 87 + 49 + 60); // 846... wait, no coupon/offer discount here
    expect(order.invoiceNumber).toMatch(/^INV-/);

    const mainLine = order.items.find(i => i.name === 'Main Product');
    expect(mainLine.gstRate).toBe(12);
    expect(mainLine.gstAmount).toBe(60);
    expect(mainLine.giftWrap.selected).toBe(true);
    expect(mainLine.giftWrap.price).toBe(49);
    expect(mainLine.bundleOffer.selected).toBe(true);
    expect(mainLine.bundleOffer.bundlePrice).toBe(600);

    const companionLine = order.items.find(i => i.name === 'Companion Product');
    expect(companionLine.gstRate).toBe(18);
    expect(companionLine.giftWrap.selected).toBe(false);
  });

  it('creates a SubOrder for the vendor with correct commission and shipping split', async () => {
    const res = await request(app).post('/api/customer/orders').set('Authorization', `Bearer ${token}`).send({
      items: [{ product: mainProduct._id, quantity: 1 }, { product: companionProduct._id, quantity: 1 }],
      shippingAddress,
      paymentMethod: 'cod',
    });
    expect(res.status).toBe(201);

    const subOrders = await SubOrder.find({ order: res.body.data._id });
    expect(subOrders).toHaveLength(1);
    expect(subOrders[0].vendor.toString()).toBe(vendor._id.toString());
    expect(subOrders[0].subtotal).toBe(650);
    expect(subOrders[0].commissionRate).toBe(10);
    expect(subOrders[0].commissionAmount).toBe(65); // 10% of 650
    expect(subOrders[0].vendorEarning).toBe(585); // 650 - 65
    expect(subOrders[0].shippingCost).toBe(60);
  });

  it('rejects an order with insufficient stock', async () => {
    const res = await request(app).post('/api/customer/orders').set('Authorization', `Bearer ${token}`).send({
      items: [{ product: mainProduct._id, quantity: 9999 }],
      shippingAddress,
      paymentMethod: 'cod',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/insufficient stock/i);
  });

  it('rejects an order with no items', async () => {
    const res = await request(app).post('/api/customer/orders').set('Authorization', `Bearer ${token}`).send({
      items: [], shippingAddress, paymentMethod: 'cod',
    });
    expect(res.status).toBe(400);
  });

  it('rejects an order with no shipping pincode', async () => {
    const res = await request(app).post('/api/customer/orders').set('Authorization', `Bearer ${token}`).send({
      items: [{ product: mainProduct._id, quantity: 1 }],
      shippingAddress: { ...shippingAddress, pincode: '' },
      paymentMethod: 'cod',
    });
    expect(res.status).toBe(400);
  });

  it('gives free vendor shipping above the vendor free-shipping threshold', async () => {
    const res = await request(app).post('/api/customer/orders').set('Authorization', `Bearer ${token}`).send({
      items: [{ product: mainProduct._id, quantity: 2 }], // 2 x 500 = 1000 > freeAbove 999
      shippingAddress,
      paymentMethod: 'cod',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.shippingCost).toBe(0);
  });

  it('decrements product stock after order creation', async () => {
    await request(app).post('/api/customer/orders').set('Authorization', `Bearer ${token}`).send({
      items: [{ product: mainProduct._id, quantity: 3 }],
      shippingAddress,
      paymentMethod: 'cod',
    });
    const updated = await Product.findById(mainProduct._id);
    expect(updated.stock).toBe(27); // 30 - 3
    expect(updated.soldCount).toBe(3);
  });

  it('assigns sequential invoice numbers across multiple orders', async () => {
    const res1 = await request(app).post('/api/customer/orders').set('Authorization', `Bearer ${token}`).send({
      items: [{ product: companionProduct._id, quantity: 1 }], shippingAddress, paymentMethod: 'cod',
    });
    const res2 = await request(app).post('/api/customer/orders').set('Authorization', `Bearer ${token}`).send({
      items: [{ product: companionProduct._id, quantity: 1 }], shippingAddress, paymentMethod: 'cod',
    });
    const num1 = parseInt(res1.body.data.invoiceNumber.split('-')[1], 10);
    const num2 = parseInt(res2.body.data.invoiceNumber.split('-')[1], 10);
    expect(num2).toBe(num1 + 1);
  });

  it('stores lat/lng on the shipping address when provided', async () => {
    const res = await request(app).post('/api/customer/orders').set('Authorization', `Bearer ${token}`).send({
      items: [{ product: companionProduct._id, quantity: 1 }],
      shippingAddress: { ...shippingAddress, lat: 22.5726, lng: 88.3639 },
      paymentMethod: 'cod',
    });
    expect(res.body.data.shippingAddress.lat).toBe(22.5726);
    expect(res.body.data.shippingAddress.lng).toBe(88.3639);
  });
});
