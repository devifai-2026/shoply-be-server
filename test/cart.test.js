const request = require('supertest');
const app = require('../src/app');
const Customer = require('../src/models/Customer');
const Category = require('../src/models/Category');
const Product = require('../src/models/Product');
const { customerToken } = require('./helpers');

describe('Cart quantity validation', () => {
  let customer, product, token;

  beforeEach(async () => {
    customer = await Customer.create({ name: 'Test Customer', email: 'cart-test@example.com', password: 'password123' });
    const category = await Category.create({ name: 'Test Category', slug: 'test-category' });
    product = await Product.create({
      name: 'Test Product', category: category._id, sku: 'CART-TEST-1', price: 100, stock: 10,
    });
    token = customerToken(customer._id);
  });

  it('rejects a negative quantity on add', async () => {
    const res = await request(app)
      .post(`/api/customer/cart/${product._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: -5 });
    expect(res.status).toBe(400);
  });

  it('rejects a negative quantity on update, without removing the item', async () => {
    await request(app).post(`/api/customer/cart/${product._id}`).set('Authorization', `Bearer ${token}`).send({ quantity: 2 });

    const res = await request(app)
      .put(`/api/customer/cart/${product._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: -5 });
    expect(res.status).toBe(400);

    const cart = await request(app).get('/api/customer/cart').set('Authorization', `Bearer ${token}`);
    expect(cart.body.data).toHaveLength(1);
    expect(cart.body.data[0].quantity).toBe(2);
  });

  it('rejects a zero quantity on update', async () => {
    await request(app).post(`/api/customer/cart/${product._id}`).set('Authorization', `Bearer ${token}`).send({ quantity: 1 });
    const res = await request(app)
      .put(`/api/customer/cart/${product._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 0 });
    expect(res.status).toBe(400);
  });

  it('rejects a non-numeric quantity on update', async () => {
    await request(app).post(`/api/customer/cart/${product._id}`).set('Authorization', `Bearer ${token}`).send({ quantity: 1 });
    const res = await request(app)
      .put(`/api/customer/cart/${product._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 'abc' });
    expect(res.status).toBe(400);
  });

  it('rejects updating quantity beyond available stock', async () => {
    await request(app).post(`/api/customer/cart/${product._id}`).set('Authorization', `Bearer ${token}`).send({ quantity: 1 });
    const res = await request(app)
      .put(`/api/customer/cart/${product._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 9999 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/stock/i);
  });

  it('caps quantity at stock when adding repeatedly', async () => {
    await request(app).post(`/api/customer/cart/${product._id}`).set('Authorization', `Bearer ${token}`).send({ quantity: 8 });
    await request(app).post(`/api/customer/cart/${product._id}`).set('Authorization', `Bearer ${token}`).send({ quantity: 8 });
    const cart = await request(app).get('/api/customer/cart').set('Authorization', `Bearer ${token}`);
    expect(cart.body.data[0].quantity).toBe(10); // capped at product.stock
  });

  it('accepts a valid positive quantity update', async () => {
    await request(app).post(`/api/customer/cart/${product._id}`).set('Authorization', `Bearer ${token}`).send({ quantity: 1 });
    const res = await request(app)
      .put(`/api/customer/cart/${product._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 3 });
    expect(res.status).toBe(200);
    const cart = await request(app).get('/api/customer/cart').set('Authorization', `Bearer ${token}`);
    expect(cart.body.data[0].quantity).toBe(3);
  });

  it('syncCart filters out non-positive and non-integer quantities', async () => {
    const res = await request(app)
      .post('/api/customer/cart/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [
        { productId: product._id.toString(), quantity: 2 },
        { productId: product._id.toString(), quantity: -1 },
        { productId: product._id.toString(), quantity: 0 },
        { productId: product._id.toString(), quantity: 1.5 },
      ] });
    expect(res.status).toBe(200);
    const cart = await request(app).get('/api/customer/cart').set('Authorization', `Bearer ${token}`);
    // Only the last matching valid entry for the same product survives the $set
    expect(cart.body.data.every(i => Number.isInteger(i.quantity) && i.quantity > 0)).toBe(true);
  });
});
