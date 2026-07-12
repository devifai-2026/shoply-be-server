// Computes a parent Order's rolled-up status from its SubOrders' statuses.
// "Most conservative forward progress" — the order only looks fully
// delivered once every vendor's parcel has arrived, but looks "shipped" as
// soon as any parcel has moved, matching typical marketplace UX.
function computeRollupStatus(subOrderStatuses) {
  if (!subOrderStatuses.length) return 'pending';

  const allDelivered = subOrderStatuses.every(s => s === 'delivered');
  if (allDelivered) return 'delivered';

  const allCancelled = subOrderStatuses.every(s => s === 'cancelled');
  if (allCancelled) return 'cancelled';

  if (subOrderStatuses.some(s => s === 'shipped' || s === 'delivered')) return 'shipped';
  if (subOrderStatuses.some(s => s === 'processing')) return 'processing';
  return 'pending';
}

// Recomputes and writes the parent Order's status from all of its SubOrders,
// skipping the write if nothing changed (avoids redundant timeline spam).
async function rollupOrderStatus(OrderModel, SubOrderModel, orderId) {
  const subOrders = await SubOrderModel.find({ order: orderId }).select('status').lean();
  if (!subOrders.length) return; // no SubOrders (store-owned order) — nothing to roll up

  const newStatus = computeRollupStatus(subOrders.map(s => s.status));
  const order = await OrderModel.findById(orderId).select('status').lean();
  if (!order || order.status === newStatus) return;

  await OrderModel.findByIdAndUpdate(orderId, {
    status: newStatus,
    $push: { timeline: { status: newStatus, note: 'Status rolled up from vendor sub-orders' } },
  });
}

module.exports = { computeRollupStatus, rollupOrderStatus };
