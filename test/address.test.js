const request = require('supertest');
const app = require('../src/app');
const Customer = require('../src/models/Customer');
const { customerToken } = require('./helpers');

describe('Address validation', () => {
  let customer, token;

  beforeEach(async () => {
    customer = await Customer.create({ name: 'Test Customer', email: 'addr-test@example.com', password: 'password123' });
    token = customerToken(customer._id);
  });

  const validAddress = {
    name: 'Test User', phone: '9876543210', line1: '123 Test St',
    city: 'Kolkata', state: 'WB', pincode: '700001',
  };

  it('accepts a fully valid address', async () => {
    const res = await request(app).post('/api/customer/addresses').set('Authorization', `Bearer ${token}`).send(validAddress);
    expect(res.status).toBe(201);
    expect(res.body.addresses[0].pincode).toBe('700001');
  });

  it.each([
    ['too short', '12345'],
    ['too long', '1234567'],
    ['starts with 0', '012345'],
    ['non-numeric', 'ABCDEF'],
  ])('rejects an invalid pincode (%s)', async (_label, pincode) => {
    const res = await request(app).post('/api/customer/addresses').set('Authorization', `Bearer ${token}`)
      .send({ ...validAddress, pincode });
    expect(res.status).toBe(422);
  });

  it.each([
    ['too short', '98765'],
    ['starts with 5 (landline range)', '5876543210'],
    ['non-numeric', 'abcdefghij'],
  ])('rejects an invalid phone (%s)', async (_label, phone) => {
    const res = await request(app).post('/api/customer/addresses').set('Authorization', `Bearer ${token}`)
      .send({ ...validAddress, phone });
    expect(res.status).toBe(422);
  });

  it('persists lat/lng/placeId from a Places API selection', async () => {
    const res = await request(app).post('/api/customer/addresses').set('Authorization', `Bearer ${token}`)
      .send({ ...validAddress, lat: 22.5726, lng: 88.3639, placeId: 'ChIJtest' });
    expect(res.status).toBe(201);
    const addr = res.body.addresses[0];
    expect(addr.lat).toBe(22.5726);
    expect(addr.lng).toBe(88.3639);
    expect(addr.placeId).toBe('ChIJtest');
  });

  it('first address added becomes default automatically', async () => {
    const res = await request(app).post('/api/customer/addresses').set('Authorization', `Bearer ${token}`).send(validAddress);
    expect(res.body.addresses[0].isDefault).toBe(true);
  });

  it('setting a new default unsets the previous default', async () => {
    const first = await request(app).post('/api/customer/addresses').set('Authorization', `Bearer ${token}`).send(validAddress);
    const second = await request(app).post('/api/customer/addresses').set('Authorization', `Bearer ${token}`)
      .send({ ...validAddress, line1: '456 Other St', isDefault: true });
    expect(second.body.addresses.find(a => a.line1 === '456 Other St').isDefault).toBe(true);
    expect(second.body.addresses.find(a => a._id === first.body.addresses[0]._id).isDefault).toBe(false);
  });

  it('rejects an invalid pincode on update too', async () => {
    const add = await request(app).post('/api/customer/addresses').set('Authorization', `Bearer ${token}`).send(validAddress);
    const addressId = add.body.addresses[0]._id;
    const res = await request(app).put(`/api/customer/addresses/${addressId}`).set('Authorization', `Bearer ${token}`)
      .send({ pincode: '00000' });
    expect(res.status).toBe(422);
  });
});
