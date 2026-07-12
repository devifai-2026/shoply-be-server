const crypto         = require('crypto');
const { getPaymentGatewayModel } = require('../models/PaymentGateway');
const { getOrderModel } = require('../models/Order');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getField = (gateway, key) => {
  const val = gateway.fields?.find(f => f.key === key)?.value || '';
  return typeof val === 'string' ? val.trim() : val;
};

// Node 18+ has native fetch
const apiFetch = async (url, { method = 'POST', headers = {}, body } = {}) => {
  try {
    const isGet = method.toUpperCase() === 'GET';
    const res = await fetch(url, {
      method,
      headers: isGet
        ? headers
        : { 'Content-Type': 'application/json', ...headers },
      body: body && !isGet ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) {
      console.error(`[API FETCH ERROR] ${url} Status: ${res.status}`, data);
    }
    return data;
  } catch (err) {
    console.error(`[API FETCH CRASH] ${url}`, err);
    throw err;
  }
};

const apiFetchForm = async (url, { headers = {}, body = {} } = {}) => {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
      body: new URLSearchParams(body).toString(),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error(`[API FORM ERROR] ${url} Status: ${res.status}`, data);
    }
    return data;
  } catch (err) {
    console.error(`[API FORM CRASH] ${url}`, err);
    throw err;
  }
};

// Official PaytmChecksum signature: sha256(body|salt) + salt, AES-128-CBC
// encrypted with the merchant key and Paytm's fixed IV.
const paytmGenerateSignature = (body, merchantKey) => {
  const salt   = crypto.randomBytes(4).toString('base64').slice(0, 4);
  const hash   = crypto.createHash('sha256').update(body + '|' + salt).digest('hex') + salt;
  const cipher = crypto.createCipheriv('aes-128-cbc', merchantKey, '@@@@&&&&####$$$$');
  let encrypted = cipher.update(hash, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return encrypted;
};

// ─── Admin: Gateway Management ────────────────────────────────────────────────

const SECRET_MASK = '••••••••';

// Secret credential values never leave the server. Configured secrets are
// replaced with a mask so the admin UI can show "saved" without the value.
const maskGateway = (gateway) => {
  const g = gateway.toObject ? gateway.toObject() : { ...gateway };
  g.fields = (g.fields || []).map(f => ({
    ...f,
    value: f.isSecret && f.value ? SECRET_MASK : f.value,
  }));
  return g;
};

exports.getGateways = async (req, res, next) => {
  try {
    const PaymentGateway = getPaymentGatewayModel(req.tenantConn);
    const gateways = await PaymentGateway.find()
      .select('+fields.value')
      .sort({ sortOrder: 1 });
    res.json({ success: true, data: gateways.map(maskGateway) });
  } catch (err) { next(err); }
};

exports.updateGateway = async (req, res, next) => {
  try {
    const PaymentGateway = getPaymentGatewayModel(req.tenantConn);
    const { fields } = req.body;
    const gateway = await PaymentGateway.findOne({ slug: req.params.slug })
      .select('+fields.value');
    if (!gateway) return res.status(404).json({ success: false, message: 'Gateway not found' });

    if (Array.isArray(fields)) {
      fields.forEach(({ key, value, label, placeholder, isSecret }) => {
        // The mask sentinel means "unchanged" — never write it over a stored secret
        if (typeof value === 'string' && /^•+$/.test(value.trim())) return;
        const f = gateway.fields.find(f => f.key === key);
        if (f) {
          if (value !== undefined) f.value = value;
        } else if (key) {
          // Field not in DB yet (e.g. saltIndex added after initial seed) — create it
          gateway.fields.push({ key, label: label || key, value: value || '', placeholder: placeholder || '', isSecret: !!isSecret });
        }
      });
    }

    await gateway.save();
    res.json({ success: true, data: maskGateway(gateway), message: 'Credentials saved' });
  } catch (err) { next(err); }
};

exports.toggleGateway = async (req, res, next) => {
  try {
    const PaymentGateway = getPaymentGatewayModel(req.tenantConn);
    const gateway = await PaymentGateway.findOne({ slug: req.params.slug })
      .select('+fields.value');
    if (!gateway) return res.status(404).json({ success: false, message: 'Gateway not found' });
    gateway.isActive = !gateway.isActive;
    await gateway.save();
    res.json({ success: true, data: maskGateway(gateway), message: `${gateway.name} ${gateway.isActive ? 'enabled' : 'disabled'}` });
  } catch (err) { next(err); }
};

exports.toggleSandbox = async (req, res, next) => {
  try {
    const PaymentGateway = getPaymentGatewayModel(req.tenantConn);
    const gateway = await PaymentGateway.findOne({ slug: req.params.slug })
      .select('+fields.value');
    if (!gateway) return res.status(404).json({ success: false, message: 'Gateway not found' });
    gateway.sandboxMode = !gateway.sandboxMode;
    await gateway.save();
    res.json({ success: true, data: maskGateway(gateway), message: `Switched to ${gateway.sandboxMode ? 'Sandbox' : 'Live'} mode` });
  } catch (err) { next(err); }
};

exports.getStats = async (req, res, next) => {
  try {
    const Order = getOrderModel(req.tenantConn);
    const PaymentGateway = getPaymentGatewayModel(req.tenantConn);
    const [totalRevenue, pendingSettlements, activeGateways] = await Promise.all([
      Order.aggregate([
        { $match: { paymentStatus: 'paid' } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Order.aggregate([
        { $match: { paymentStatus: 'paid', status: { $nin: ['delivered', 'refunded'] } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      PaymentGateway.countDocuments({ isActive: true }),
    ]);

    res.json({
      success: true,
      data: {
        totalRevenue:       totalRevenue[0]?.total || 0,
        pendingSettlements: pendingSettlements[0]?.total || 0,
        activeGateways,
      },
    });
  } catch (err) { next(err); }
};

// ─── Storefront: Active Gateways (no secrets) ─────────────────────────────────

exports.getStorefrontGateways = async (req, res, next) => {
  try {
    const PaymentGateway = getPaymentGatewayModel(req.tenantConn);
    const gateways = await PaymentGateway.find({ isActive: true })
      .select('slug name type description sandboxMode sortOrder')
      .sort({ sortOrder: 1 })
      .lean();
    res.json({ success: true, data: gateways });
  } catch (err) { next(err); }
};

// ─── Customer: Initiate Payment ───────────────────────────────────────────────

exports.initiatePayment = async (req, res, next) => {
  try {
    const Order = getOrderModel(req.tenantConn);
    const PaymentGateway = getPaymentGatewayModel(req.tenantConn);
    const { gateway: slug, orderId, currency = 'INR', customerInfo = {} } = req.body;

    // The charge amount always comes from the persisted order — a client-sent
    // amount is never trusted.
    const order = await Order.findOne({ _id: orderId, customer: req.customer._id });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    if (order.paymentStatus === 'paid') {
      return res.status(400).json({ success: false, message: 'Order is already paid' });
    }
    const amount = order.total;

    const gateway = await PaymentGateway.findOne({ slug, isActive: true })
      .select('+fields.value');
    if (!gateway) {
      return res.status(400).json({ success: false, message: 'Payment gateway not available' });
    }

    const amountPaise = Math.round(amount * 100);
    const isSandbox   = gateway.sandboxMode;
    const clientUrl   = process.env.STOREFRONT_URL || process.env.CLIENT_URL || 'http://localhost:3001';

    // ── Razorpay ──────────────────────────────────────────────────────────────
    if (slug === 'razorpay') {
      const keyId     = getField(gateway, 'keyId');
      const keySecret = getField(gateway, 'keySecret');
      if (!keyId || !keySecret) {
        return res.status(400).json({ success: false, message: 'Razorpay credentials not configured' });
      }
      const auth = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
      const rzpOrder = await apiFetch('https://api.razorpay.com/v1/orders', {
        headers: { Authorization: auth },
        body: { amount: amountPaise, currency, receipt: `rcpt_${orderId}` },
      });
      if (rzpOrder.error) throw new Error(rzpOrder.error.description || 'Razorpay order creation failed');
      return res.json({
        success: true,
        gateway: 'razorpay',
        data: { razorpayOrderId: rzpOrder.id, keyId, amount: amountPaise, currency: rzpOrder.currency },
      });
    }

    // ── Stripe ────────────────────────────────────────────────────────────────
    if (slug === 'stripe') {
      const pubKey    = getField(gateway, 'pubKey');
      const secretKey = getField(gateway, 'secretKey');
      if (!pubKey || !secretKey) {
        return res.status(400).json({ success: false, message: 'Stripe credentials not configured' });
      }
      const auth = 'Basic ' + Buffer.from(`${secretKey}:`).toString('base64');
      const intent = await apiFetchForm('https://api.stripe.com/v1/payment_intents', {
        headers: { Authorization: auth },
        body: {
          amount:   amountPaise,
          currency: (currency || 'inr').toLowerCase(),
          'automatic_payment_methods[enabled]': 'true',
          'metadata[orderId]': orderId,
        },
      });
      if (intent.error) throw new Error(intent.error.message || 'Stripe PaymentIntent creation failed');
      return res.json({
        success: true,
        gateway: 'stripe',
        data: { clientSecret: intent.client_secret, publishableKey: pubKey },
      });
    }

    // ── Cashfree ──────────────────────────────────────────────────────────────
    if (slug === 'cashfree') {
      const appId     = getField(gateway, 'appId');
      const secretKey = getField(gateway, 'secretKey');
      if (!appId || !secretKey) {
        return res.status(400).json({ success: false, message: 'Cashfree credentials not configured' });
      }
      const baseUrl = isSandbox
        ? 'https://sandbox.cashfree.com/pg/orders'
        : 'https://api.cashfree.com/pg/orders';
      const cfOrder = await apiFetch(baseUrl, {
        headers: {
          'x-api-version':   '2022-09-01',
          'x-client-id':     appId,
          'x-client-secret': secretKey,
        },
        body: {
          order_id:       `CF_${orderId}_${Date.now()}`,
          order_amount:   amount,
          order_currency: currency || 'INR',
          customer_details: {
            customer_id:    customerInfo.id   || req.customer._id.toString(),
            customer_email: customerInfo.email || '',
            customer_phone: customerInfo.phone || '9999999999',
          },
          order_meta: {
            return_url: `${clientUrl}/checkout/confirmation/${orderId}`,
          },
        },
      });
      if (cfOrder.message && !cfOrder.payment_session_id) throw new Error(cfOrder.message);
      return res.json({
        success: true,
        gateway: 'cashfree',
        data: {
          paymentSessionId: cfOrder.payment_session_id,
          cfOrderId:        cfOrder.order_id,
          appId,
          env: isSandbox ? 'sandbox' : 'production',
        },
      });
    }

    // ── PhonePe ───────────────────────────────────────────────────────────────
    if (slug === 'phonepe') {
      const merchantId = getField(gateway, 'merchantId');
      const saltKey    = getField(gateway, 'saltKey');
      const saltIndex  = getField(gateway, 'saltIndex') || '1';
      if (!merchantId || !saltKey) {
        return res.status(400).json({ success: false, message: 'PhonePe credentials not configured' });
      }
      const transactionId = `PP_${orderId}_${Date.now()}`;
      const payload = {
        merchantId,
        merchantTransactionId: transactionId,
        merchantUserId: req.customer._id.toString(),
        amount:         amountPaise,
        redirectUrl:    `${clientUrl}/checkout/confirmation/${orderId}?txn=${transactionId}`,
        redirectMode:   'GET',
        mobileNumber:   customerInfo.phone || '',
        paymentInstrument: { type: 'PAY_PAGE' },
      };
      const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
      const xVerifyHash   = crypto.createHash('sha256')
        .update(base64Payload + '/pg/v1/pay' + saltKey)
        .digest('hex');
      const xVerify = `${xVerifyHash}###${saltIndex}`;
      const baseUrl = isSandbox
        ? 'https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay'
        : 'https://api.phonepe.com/apis/hermes/pg/v1/pay';
      const ppRes = await apiFetch(baseUrl, {
        headers: { 'X-VERIFY': xVerify, 'X-MERCHANT-ID': merchantId },
        body: { request: base64Payload },
      });
      if (!ppRes.success) throw new Error(ppRes.message || 'PhonePe payment initiation failed');
      const redirectUrl = ppRes.data?.instrumentResponse?.redirectInfo?.url;
      if (!redirectUrl) throw new Error('PhonePe did not return a redirect URL');
      return res.json({ success: true, gateway: 'phonepe', data: { redirectUrl, transactionId } });
    }

    // ── Paytm ─────────────────────────────────────────────────────────────────
    if (slug === 'paytm') {
      const mid         = getField(gateway, 'mid');
      const merchantKey = getField(gateway, 'merchantKey');
      if (!mid || !merchantKey) {
        return res.status(400).json({ success: false, message: 'Paytm credentials not configured' });
      }
      const paytmOrderId  = `PAYTM_${orderId}_${Date.now()}`;
      const websiteName   = isSandbox ? 'WEBSTAGING' : 'DEFAULT';
      const callbackUrl   = `${isSandbox ? 'https://securegw-stage.paytm.in' : 'https://securegw.paytm.in'}/theia/paytmCallback?ORDER_ID=${paytmOrderId}`;

      // Generate Paytm checksum (simplified — uses their own algorithm)
      const paytmParams = {
        MID:          mid,
        WEBSITE:      websiteName,
        ORDER_ID:     paytmOrderId,
        TXN_AMOUNT:   amount.toFixed(2),
        CUST_ID:      customerInfo.id || req.customer._id.toString(),
        INDUSTRY_TYPE_ID: 'Retail',
        CHANNEL_ID:   'WEB',
        CALLBACK_URL: callbackUrl,
      };
      const paramStr = Object.keys(paytmParams).sort().map(k => `${k}=${paytmParams[k]}`).join('|');
      const checksum = crypto.createHmac('sha256', merchantKey).update(paramStr).digest('hex');

      const formUrl = isSandbox
        ? 'https://securegw-stage.paytm.in/order/process'
        : 'https://securegw.paytm.in/order/process';
      return res.json({
        success: true,
        gateway: 'paytm',
        data: { formUrl, params: { ...paytmParams, CHECKSUMHASH: checksum } },
      });
    }

    // ── PayU ──────────────────────────────────────────────────────────────────
    if (slug === 'payu') {
      const merchantKey = getField(gateway, 'merchantKey');
      const salt        = getField(gateway, 'salt');
      if (!merchantKey || !salt) {
        return res.status(400).json({ success: false, message: 'PayU credentials not configured' });
      }
      const txnId      = `PAYU_${orderId}_${Date.now()}`;
      const productInfo = 'Order';
      const firstName  = (customerInfo.name || 'Customer').split(' ')[0];
      const email      = customerInfo.email || '';
      const phone      = customerInfo.phone || '';

      // sha512(key|txnid|amount|productinfo|firstname|email|||||||||||salt)
      const hashStr = `${merchantKey}|${txnId}|${amount}|${productInfo}|${firstName}|${email}|||||||||||${salt}`;
      const hash    = crypto.createHash('sha512').update(hashStr).digest('hex');
      const formUrl = isSandbox
        ? 'https://test.payu.in/_payment'
        : 'https://secure.payu.in/_payment';
      return res.json({
        success: true,
        gateway: 'payu',
        data: {
          formUrl,
          params: {
            key:         merchantKey,
            txnid:       txnId,
            amount:      amount.toFixed(2),
            productinfo: productInfo,
            firstname:   firstName,
            email,
            phone,
            surl: `${clientUrl}/payment/success`,
            furl: `${clientUrl}/payment/failure`,
            hash,
          },
        },
      });
    }

    res.status(400).json({ success: false, message: 'Unsupported gateway' });
  } catch (err) { next(err); }
};

// ─── Customer: Verify Payment ─────────────────────────────────────────────────

exports.verifyPayment = async (req, res, next) => {
  try {
    const Order = getOrderModel(req.tenantConn);
    const PaymentGateway = getPaymentGatewayModel(req.tenantConn);
    const { gateway: slug, orderId, paymentData } = req.body;

    const order = await Order.findOne({ _id: orderId, customer: req.customer._id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.paymentStatus === 'paid') return res.json({ success: true, data: order });

    const gwDoc = await PaymentGateway.findOne({ slug, isActive: true }).select('+fields.value');
    if (!gwDoc) return res.status(400).json({ success: false, message: 'Gateway not available' });

    if (slug === 'razorpay') {
      const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = paymentData;
      const keySecret = getField(gwDoc, 'keySecret');
      const expected  = crypto
        .createHmac('sha256', keySecret)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest('hex');
      const expectedBuf = Buffer.from(expected, 'hex');
      const actualBuf   = Buffer.from(String(razorpaySignature || ''), 'hex');
      const signatureValid = expectedBuf.length === actualBuf.length &&
        crypto.timingSafeEqual(expectedBuf, actualBuf);
      if (!signatureValid) {
        return res.status(400).json({ success: false, message: 'Payment signature mismatch' });
      }
      order.transactionId  = razorpayPaymentId;
      order.paymentDetails = { razorpayOrderId, razorpayPaymentId, razorpaySignature };
    } else if (slug === 'stripe') {
      const secretKey = getField(gwDoc, 'secretKey');
      const intentId  = paymentData.paymentIntentId;
      if (!secretKey || !intentId) {
        return res.status(400).json({ success: false, message: 'Missing Stripe payment data' });
      }
      const auth   = 'Basic ' + Buffer.from(`${secretKey}:`).toString('base64');
      const intent = await apiFetch(`https://api.stripe.com/v1/payment_intents/${intentId}`, {
        method:  'GET',
        headers: { Authorization: auth },
      });
      if (intent.error || intent.status !== 'succeeded') {
        return res.status(400).json({ success: false, message: intent.error?.message || 'Stripe payment not completed' });
      }
      if (intent.amount !== Math.round(order.total * 100)) {
        return res.status(400).json({ success: false, message: 'Stripe payment amount mismatch' });
      }
      order.transactionId  = intent.id;
      order.paymentDetails = { paymentIntentId: intent.id, amount: intent.amount, currency: intent.currency, status: intent.status };
    } else if (slug === 'cashfree') {
      const appId     = getField(gwDoc, 'appId');
      const secretKey = getField(gwDoc, 'secretKey');
      const cfOrderId = paymentData.cfOrderId;
      if (!appId || !secretKey || !cfOrderId) {
        return res.status(400).json({ success: false, message: 'Missing Cashfree payment data' });
      }
      const baseUrl = gwDoc.sandboxMode
        ? 'https://sandbox.cashfree.com/pg/orders'
        : 'https://api.cashfree.com/pg/orders';
      const cfOrder = await apiFetch(`${baseUrl}/${cfOrderId}`, {
        method:  'GET',
        headers: {
          'x-api-version':   '2022-09-01',
          'x-client-id':     appId,
          'x-client-secret': secretKey,
        },
      });
      if (cfOrder.order_status !== 'PAID') {
        return res.status(400).json({ success: false, message: cfOrder.message || 'Cashfree payment not completed' });
      }
      if (Math.round(Number(cfOrder.order_amount) * 100) !== Math.round(order.total * 100)) {
        return res.status(400).json({ success: false, message: 'Cashfree payment amount mismatch' });
      }
      order.transactionId  = cfOrderId;
      order.paymentDetails = { cfOrderId, orderAmount: cfOrder.order_amount, orderStatus: cfOrder.order_status };
    } else if (slug === 'paytm') {
      const mid         = getField(gwDoc, 'mid');
      const merchantKey = getField(gwDoc, 'merchantKey');
      const paytmOrderId = paymentData.paytmOrderId || paymentData.transactionId;
      if (!mid || !merchantKey || !paytmOrderId) {
        return res.status(400).json({ success: false, message: 'Missing Paytm payment data' });
      }
      const statusBody = { mid, orderId: paytmOrderId };
      const signature  = paytmGenerateSignature(JSON.stringify(statusBody), merchantKey);
      const baseUrl    = gwDoc.sandboxMode
        ? 'https://securegw-stage.paytm.in/v3/order/status'
        : 'https://securegw.paytm.in/v3/order/status';
      const statusRes = await apiFetch(baseUrl, {
        body: { body: statusBody, head: { signature } },
      });
      const result = statusRes.body || {};
      if (result.resultInfo?.resultStatus !== 'TXN_SUCCESS') {
        return res.status(400).json({ success: false, message: result.resultInfo?.resultMsg || 'Paytm payment not completed' });
      }
      if (Math.round(Number(result.txnAmount) * 100) !== Math.round(order.total * 100)) {
        return res.status(400).json({ success: false, message: 'Paytm payment amount mismatch' });
      }
      order.transactionId  = result.txnId || paytmOrderId;
      order.paymentDetails = { paytmOrderId, txnId: result.txnId, txnAmount: result.txnAmount, status: result.resultInfo.resultStatus };
    } else if (slug === 'payu') {
      const merchantKey = getField(gwDoc, 'merchantKey');
      const salt        = getField(gwDoc, 'salt');
      const txnId       = paymentData.txnid || paymentData.transactionId;
      if (!merchantKey || !salt || !txnId) {
        return res.status(400).json({ success: false, message: 'Missing PayU payment data' });
      }
      const hash    = crypto.createHash('sha512')
        .update(`${merchantKey}|verify_payment|${txnId}|${salt}`)
        .digest('hex');
      const baseUrl = gwDoc.sandboxMode
        ? 'https://test.payu.in/merchant/postservice.php?form=2'
        : 'https://info.payu.in/merchant/postservice.php?form=2';
      const verifyRes = await apiFetchForm(baseUrl, {
        body: { key: merchantKey, command: 'verify_payment', var1: txnId, hash },
      });
      const txn = verifyRes.transaction_details?.[txnId];
      if (!txn || txn.status !== 'success') {
        return res.status(400).json({ success: false, message: 'PayU payment not completed' });
      }
      if (Math.round(Number(txn.amt) * 100) !== Math.round(order.total * 100)) {
        return res.status(400).json({ success: false, message: 'PayU payment amount mismatch' });
      }
      order.transactionId  = txn.mihpayid || txnId;
      order.paymentDetails = { txnid: txnId, mihpayid: txn.mihpayid, amount: txn.amt, status: txn.status };
    } else if (slug === 'phonepe') {
      const merchantId    = getField(gwDoc, 'merchantId');
      const saltKey       = getField(gwDoc, 'saltKey');
      const saltIndex     = getField(gwDoc, 'saltIndex') || '1';
      const txnId         = paymentData.transactionId;
      if (!merchantId || !saltKey || !txnId) {
        return res.status(400).json({ success: false, message: 'Missing PhonePe payment data' });
      }
      const statusPath    = `/pg/v1/status/${merchantId}/${txnId}`;
      const xVerifyHash   = crypto.createHash('sha256')
        .update(statusPath + saltKey)
        .digest('hex');
      const xVerify       = `${xVerifyHash}###${saltIndex}`;
      const baseUrl       = gwDoc.sandboxMode
        ? `https://api-preprod.phonepe.com/apis/pg-sandbox${statusPath}`
        : `https://api.phonepe.com/apis/hermes${statusPath}`;
      const statusRes = await apiFetch(baseUrl, {
        method:  'GET',
        headers: { 'X-VERIFY': xVerify, 'X-MERCHANT-ID': merchantId },
      });
      if (!statusRes.success || statusRes.data?.state !== 'COMPLETED') {
        return res.status(400).json({
          success: false,
          message: statusRes.message || 'PhonePe payment not completed',
        });
      }
      order.transactionId  = statusRes.data?.transactionId || txnId;
      order.paymentDetails = statusRes.data;
    } else {
      // Never mark an order paid off client-supplied data for a gateway we
      // can't verify server-side.
      return res.status(400).json({ success: false, message: 'Payment verification not supported for this gateway' });
    }

    order.paymentStatus = 'paid';
    order.timeline.push({ status: 'processing', note: `Payment confirmed via ${gwDoc.name}` });
    await order.save();

    res.json({ success: true, data: order });
  } catch (err) { next(err); }
};
