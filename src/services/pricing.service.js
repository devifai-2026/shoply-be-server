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

module.exports = { computeShipping };
