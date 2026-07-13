const { Tenant } = require('../models/control');
const { getTenantConnection } = require('../config/tenantDb');
const { getCartModel } = require('../models/Cart');
const { getCustomerModel } = require('../models/Customer');
const emailService = require('../services/email.service');

const ABANDONED_AFTER_MS = 2 * 60 * 60 * 1000; // 2 hours of no cart activity

async function processTenant(slug) {
  const conn = await getTenantConnection(slug);
  if (!conn) return;

  const Cart = getCartModel(conn);
  const Customer = getCustomerModel(conn);

  const cutoff = new Date(Date.now() - ABANDONED_AFTER_MS);
  const abandoned = await Cart.find({
    'items.0': { $exists: true }, // has at least one item
    lastActivityAt: { $lte: cutoff },
    reminderSentAt: null,
  }).populate('items.product', 'name images price discountPrice').lean();

  for (const cart of abandoned) {
    try {
      const customer = await Customer.findById(cart.customer).select('name email').lean();
      if (!customer?.email) continue;

      await emailService.sendCartReminderEmail({
        toEmail: customer.email,
        toName: customer.name || 'there',
        items: (cart.items || []).filter(i => i.product).map(i => ({
          name: i.product.name,
          image: i.product.images?.[0] || null,
          price: i.product.discountPrice || i.product.price,
          quantity: i.quantity,
        })),
      });

      await Cart.findByIdAndUpdate(cart._id, { reminderSentAt: new Date() });
    } catch (err) {
      console.error(`[AbandonedCart:${slug}] failed for cart ${cart._id}:`, err.message);
    }
  }
}

async function processAllTenants() {
  const tenants = await Tenant.find({ status: 'active' }).select('slug').lean();
  for (const t of tenants) {
    try {
      await processTenant(t.slug);
    } catch (err) {
      console.error(`[AbandonedCart:${t.slug}] tenant processing failed:`, err.message);
    }
  }
}

function startAbandonedCartJob() {
  // Every 30 minutes — reminders don't need to fire the instant a cart
  // crosses the threshold, and this keeps the per-tenant DB scan light.
  setInterval(processAllTenants, 30 * 60 * 1000);
}

module.exports = { startAbandonedCartJob };
