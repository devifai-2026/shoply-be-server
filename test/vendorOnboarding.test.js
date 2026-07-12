const request = require('supertest');
const app = require('../src/app');
const Vendor = require('../src/models/Vendor');

describe('Vendor onboarding', () => {
  const validVendor = {
    name: 'New Seller', email: 'seller@example.com', password: 'password123',
    storeName: 'New Seller Store',
  };

  it('registers a vendor with pending status by default', async () => {
    const res = await request(app).post('/api/vendor/auth/register').send(validVendor);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.token).toBeTruthy();
  });

  it('rejects registration missing required fields', async () => {
    const res = await request(app).post('/api/vendor/auth/register').send({ email: 'x@example.com' });
    expect(res.status).toBe(400);
  });

  it('rejects a password shorter than 8 characters', async () => {
    const res = await request(app).post('/api/vendor/auth/register').send({ ...validVendor, password: 'short' });
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate email', async () => {
    await request(app).post('/api/vendor/auth/register').send(validVendor);
    const res = await request(app).post('/api/vendor/auth/register').send({ ...validVendor, storeName: 'Another Store' });
    expect(res.status).toBe(409);
  });

  it('auto-generates a unique slug from the store name', async () => {
    const res = await request(app).post('/api/vendor/auth/register').send(validVendor);
    expect(res.body.data.slug).toBe('new-seller-store');
  });

  it('defaults shippingSettings and gstEnabled sensibly for a new vendor', async () => {
    const res = await request(app).post('/api/vendor/auth/register').send(validVendor);
    expect(res.body.data.shippingSettings.useCustomRates).toBe(false);
    expect(res.body.data.gstEnabled).toBe(true);
  });

  it('logs in a registered vendor with correct credentials', async () => {
    await request(app).post('/api/vendor/auth/register').send(validVendor);
    const res = await request(app).post('/api/vendor/auth/login').send({ email: validVendor.email, password: validVendor.password });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it('rejects login with wrong password', async () => {
    await request(app).post('/api/vendor/auth/register').send(validVendor);
    const res = await request(app).post('/api/vendor/auth/login').send({ email: validVendor.email, password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  it('does not accept bank/pickup details as required at the API layer (matches current client-only enforcement)', async () => {
    // Documents existing behavior found during review: the vendor-web wizard
    // requires bank + pickup address client-side, but the API itself does not.
    const res = await request(app).post('/api/vendor/auth/register').send(validVendor);
    expect(res.status).toBe(201);
    const vendor = await Vendor.findById(res.body.data._id);
    expect(vendor.bankDetails.accountNumber).toBe('');
    expect(vendor.pickupAddress.line1).toBe('');
  });
});
