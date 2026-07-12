const pricing = require('../src/services/pricing.service');
const ShippingZone = require('../src/models/ShippingZone');
const StoreSettings = require('../src/models/StoreSettings');

describe('pricing.service', () => {
  describe('computeLineGst', () => {
    it('uses the product gstRate when set', () => {
      const { rate, amount } = pricing.computeLineGst({ product: { gstRate: 12 }, lineSubtotal: 500, storeGstRate: 18 });
      expect(rate).toBe(12);
      expect(amount).toBe(60);
    });

    it('falls back to the store default when product.gstRate is not set', () => {
      const { rate, amount } = pricing.computeLineGst({ product: { gstRate: null }, lineSubtotal: 500, storeGstRate: 18 });
      expect(rate).toBe(18);
      expect(amount).toBe(90);
    });

    it('returns zero when tax is included in listed price', () => {
      const { rate, amount } = pricing.computeLineGst({ product: { gstRate: 12 }, lineSubtotal: 500, storeGstRate: 18, taxIncluded: true });
      expect(rate).toBe(0);
      expect(amount).toBe(0);
    });

    it('treats gstRate: 0 on the product as an explicit override, not "unset"', () => {
      const { rate, amount } = pricing.computeLineGst({ product: { gstRate: 0 }, lineSubtotal: 500, storeGstRate: 18 });
      expect(rate).toBe(0);
      expect(amount).toBe(0);
    });
  });

  describe('computeGiftWrap', () => {
    it('returns zero when not selected', () => {
      const result = pricing.computeGiftWrap({ product: { giftWrap: { enabled: true, price: 49 } }, selected: false, quantity: 2 });
      expect(result.selected).toBe(false);
      expect(result.total).toBe(0);
    });

    it('returns zero when the product does not offer gift wrap, even if selected', () => {
      const result = pricing.computeGiftWrap({ product: { giftWrap: { enabled: false, price: 49 } }, selected: true, quantity: 2 });
      expect(result.selected).toBe(false);
      expect(result.total).toBe(0);
    });

    it('multiplies gift wrap price by quantity', () => {
      const result = pricing.computeGiftWrap({ product: { giftWrap: { enabled: true, price: 49 } }, selected: true, quantity: 3 });
      expect(result.selected).toBe(true);
      expect(result.total).toBe(147);
    });
  });

  describe('computeBundleOffer', () => {
    const product = { price: 500, discountPrice: null, bundleOffer: { enabled: true, bundlePrice: 600 } };
    const companion = { price: 150, discountPrice: null };

    it('computes savings as normal combined price minus bundle price', () => {
      const result = pricing.computeBundleOffer({ product, companionProduct: companion, selected: true });
      expect(result.selected).toBe(true);
      expect(result.savings).toBe(50); // (500+150) - 600
    });

    it('returns zero savings when not selected', () => {
      const result = pricing.computeBundleOffer({ product, companionProduct: companion, selected: false });
      expect(result.selected).toBe(false);
      expect(result.savings).toBe(0);
    });

    it('returns zero savings when the bundle is not actually a discount', () => {
      const noSavingsProduct = { ...product, bundleOffer: { enabled: true, bundlePrice: 700 } }; // more than combined 650
      const result = pricing.computeBundleOffer({ product: noSavingsProduct, companionProduct: companion, selected: true });
      expect(result.savings).toBe(0); // clamped at 0, never negative
    });

    it('returns not-selected when companion product is missing', () => {
      const result = pricing.computeBundleOffer({ product, companionProduct: null, selected: true });
      expect(result.selected).toBe(false);
    });
  });

  describe('computeShipping (global zone table)', () => {
    beforeEach(async () => {
      await ShippingZone.create({ name: 'Metro', coverageArea: 'Metro', baseRate: 50, freeAbove: 500, pincodes: ['700001'], sortOrder: 0, isActive: true });
      await ShippingZone.create({ name: 'Rest of India', coverageArea: 'All', baseRate: 80, isActive: true, sortOrder: 1 });
      await StoreSettings.create({ storeId: 'default' });
    });

    it('applies the matching zone rate below the free-shipping threshold', async () => {
      const { rate, zone } = await pricing.computeShipping({ pincode: '700001', merchandiseTotal: 100 });
      expect(rate).toBe(50);
      expect(zone).toBe('Metro');
    });

    it('gives free shipping at/above the zone free-shipping threshold', async () => {
      const { rate } = await pricing.computeShipping({ pincode: '700001', merchandiseTotal: 500 });
      expect(rate).toBe(0);
    });

    it('falls back to the catch-all zone for an unmatched pincode', async () => {
      const { rate, zone } = await pricing.computeShipping({ pincode: '999999', merchandiseTotal: 100 });
      expect(rate).toBe(80);
      expect(zone).toBe('Rest of India');
    });
  });

  describe('computeVendorShipping', () => {
    beforeEach(async () => {
      await ShippingZone.create({ name: 'Global', coverageArea: 'All', baseRate: 40, isActive: true, sortOrder: 0 });
      await StoreSettings.create({ storeId: 'default' });
    });

    it('falls back to the global zone table when the vendor has no custom rates', async () => {
      const { rate } = await pricing.computeVendorShipping({
        vendor: { shippingSettings: { useCustomRates: false } }, pincode: '700001', merchandiseTotal: 100,
      });
      expect(rate).toBe(40);
    });

    it('uses the vendor flat rate when custom rates are enabled', async () => {
      const { rate } = await pricing.computeVendorShipping({
        vendor: { storeName: 'Acme', shippingSettings: { useCustomRates: true, flatRate: 60, freeAbove: 999 } },
        pincode: '700001', merchandiseTotal: 500,
      });
      expect(rate).toBe(60);
    });

    it('gives free shipping at/above the vendor-specific threshold', async () => {
      const { rate } = await pricing.computeVendorShipping({
        vendor: { storeName: 'Acme', shippingSettings: { useCustomRates: true, flatRate: 60, freeAbove: 999 } },
        pincode: '700001', merchandiseTotal: 1000,
      });
      expect(rate).toBe(0);
    });
  });
});
