const request = require('supertest');
const app = require('../src/app');
const Category = require('../src/models/Category');
const Product = require('../src/models/Product');

describe('Storefront product listing & filters', () => {
  let categoryA, categoryB;

  beforeEach(async () => {
    categoryA = await Category.create({ name: 'Fiction', slug: 'fiction' });
    categoryB = await Category.create({ name: 'Non-Fiction', slug: 'non-fiction' });

    await Product.create([
      {
        name: 'Cheap Fiction Book', category: categoryA._id, sku: 'F-1', price: 100, stock: 5,
        status: 'active', visibleWeb: true, brand: 'BrandA',
        attributes: new Map([['color', 'red'], ['size', 'M']]),
      },
      {
        name: 'Expensive Fiction Book', category: categoryA._id, sku: 'F-2', price: 900, stock: 0,
        status: 'active', visibleWeb: true, brand: 'BrandB',
        attributes: new Map([['color', 'blue'], ['size', 'L']]),
      },
      {
        name: 'Non-Fiction Book', category: categoryB._id, sku: 'NF-1', price: 300, stock: 10,
        status: 'active', visibleWeb: true, brand: 'BrandA',
      },
      {
        name: 'Draft Book (hidden)', category: categoryA._id, sku: 'F-3', price: 200, stock: 5,
        status: 'draft', visibleWeb: true,
      },
      {
        name: 'Web-hidden Book', category: categoryA._id, sku: 'F-4', price: 200, stock: 5,
        status: 'active', visibleWeb: false,
      },
    ]);
  });

  it('only returns active, web-visible products', async () => {
    const res = await request(app).get('/api/storefront/products');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data.map(p => p.name)).not.toContain('Draft Book (hidden)');
    expect(res.body.data.map(p => p.name)).not.toContain('Web-hidden Book');
  });

  it('filters by category slug', async () => {
    const res = await request(app).get('/api/storefront/products').query({ categorySlug: 'fiction' });
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.every(p => p.category.slug === 'fiction')).toBe(true);
  });

  it('filters by brand', async () => {
    const res = await request(app).get('/api/storefront/products').query({ brand: 'BrandA' });
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.every(p => p.brand === 'BrandA')).toBe(true);
  });

  it('filters by price range', async () => {
    const res = await request(app).get('/api/storefront/products').query({ minPrice: 200, maxPrice: 500 });
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Non-Fiction Book');
  });

  it('filters by color attribute', async () => {
    const res = await request(app).get('/api/storefront/products').query({ color: 'red' });
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Cheap Fiction Book');
  });

  it('filters to in-stock only', async () => {
    const res = await request(app).get('/api/storefront/products').query({ inStock: 'true' });
    expect(res.body.data.every(p => p.stock > 0)).toBe(true);
    expect(res.body.data.map(p => p.name)).not.toContain('Expensive Fiction Book'); // stock: 0
  });

  it('sorts by price ascending', async () => {
    const res = await request(app).get('/api/storefront/products').query({ sort: 'price-asc' });
    const prices = res.body.data.map(p => p.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it('sorts by price descending', async () => {
    const res = await request(app).get('/api/storefront/products').query({ sort: 'price-desc' });
    const prices = res.body.data.map(p => p.price);
    expect(prices).toEqual([...prices].sort((a, b) => b - a));
  });

  it('paginates results', async () => {
    const res = await request(app).get('/api/storefront/products').query({ limit: 1, page: 1 });
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination.total).toBe(3);
    expect(res.body.pagination.pages).toBe(3);
  });

  it('returns facets reflecting the current result set', async () => {
    const res = await request(app).get('/api/storefront/products').query({ categorySlug: 'fiction' });
    expect(res.body.facets.brands.sort()).toEqual(['BrandA', 'BrandB']);
    expect(res.body.facets.colors.sort()).toEqual(['blue', 'red']);
  });

  it('returns an empty result for an unknown category slug', async () => {
    const res = await request(app).get('/api/storefront/products').query({ categorySlug: 'does-not-exist' });
    expect(res.body.data).toHaveLength(0);
  });
});
