const ShippingZone  = require('../models/ShippingZone');
const StoreSettings = require('../models/StoreSettings');

/**
 * Resolve the shipping cost for a destination pincode and merchandise total.
 * Single source of truth — used by both the public /calculate-rate endpoint
 * and order creation, so the quoted rate and the charged rate can't diverge.
 */
async function computeShipping({ pincode, merchandiseTotal = 0, weight = 0 }) {
  const [zones, settings] = await Promise.all([
    ShippingZone.find({ isActive: true }).sort({ sortOrder: 1 }),
    StoreSettings.findOne({ storeId: 'default' }).select('shipping').lean(),
  ]);

  const zone = zones.find(z => z.pincodes?.length ? z.pincodes.includes(pincode) : true) || zones[zones.length - 1];
  if (!zone) return { rate: 0, zone: null, estimatedDays: null };

  if (zone.freeAbove && merchandiseTotal >= zone.freeAbove) {
    return { rate: 0, zone: zone.name, estimatedDays: zone.estimatedDays };
  }

  let rate = zone.baseRate;
  if (settings?.shipping?.weightEnabled && weight && weight > settings.shipping.baseWeight) {
    rate += Math.ceil(weight - settings.shipping.baseWeight) * (settings.shipping.extraChargePerKg || 0);
  }

  return { rate, zone: zone.name, estimatedDays: zone.estimatedDays };
}

/**
 * Per-vendor shipping override — falls back to the global store-wide
 * computeShipping() above when the vendor hasn't opted into custom rates.
 * `vendor` is a lean Vendor doc (or plain object) with `shippingSettings`.
 */
async function computeVendorShipping({ vendor, pincode, merchandiseTotal = 0, weight = 0 }) {
  const custom = vendor?.shippingSettings;
  if (!custom?.useCustomRates) {
    return computeShipping({ pincode, merchandiseTotal, weight });
  }

  if (custom.freeAbove != null && merchandiseTotal >= custom.freeAbove) {
    return { rate: 0, zone: `${vendor.storeName || 'Vendor'} (custom)`, estimatedDays: null };
  }

  return { rate: custom.flatRate || 0, zone: `${vendor.storeName || 'Vendor'} (custom)`, estimatedDays: null };
}

/**
 * GST for a single order line. Falls back product → store default, in that
 * priority order, matching how the rate is later displayed on invoices.
 */
function computeLineGst({ product, lineSubtotal, storeGstRate = 0, taxIncluded = false }) {
  if (taxIncluded) return { rate: 0, amount: 0 };
  const rate = typeof product?.gstRate === 'number' ? product.gstRate : (storeGstRate || 0);
  const amount = Math.round(lineSubtotal * (rate / 100) * 100) / 100;
  return { rate, amount };
}

/**
 * Resolves the gift-wrap price for a line item if the customer opted in.
 * Snapshots Product.giftWrap.price at order time so later price changes on
 * the product don't retroactively alter historical order totals.
 */
function computeGiftWrap({ product, selected, quantity = 1 }) {
  if (!selected || !product?.giftWrap?.enabled) return { selected: false, price: 0, total: 0 };
  const price = product.giftWrap.price || 0;
  return { selected: true, price, total: price * quantity };
}

/**
 * Resolves a bundle-offer selection: the customer is buying `product` and
 * has opted into the bundle with `product.bundleOffer.withProduct` — savings
 * are the difference between the two items' combined normal price and the
 * seller-configured bundlePrice.
 */
function computeBundleOffer({ product, companionProduct, selected }) {
  if (!selected || !product?.bundleOffer?.enabled || !companionProduct) {
    return { selected: false, bundlePrice: null, savings: 0 };
  }
  const normalCombined = (product.discountPrice || product.price) + (companionProduct.discountPrice || companionProduct.price);
  const bundlePrice = product.bundleOffer.bundlePrice;
  const savings = bundlePrice != null ? Math.max(0, normalCombined - bundlePrice) : 0;
  return { selected: true, bundlePrice, savings };
}

module.exports = {
  computeShipping,
  computeVendorShipping,
  computeLineGst,
  computeGiftWrap,
  computeBundleOffer,
};
