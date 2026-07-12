const nodemailer  = require('nodemailer');
const StoreSettings = require('../models/StoreSettings');

async function createTransporter() {
  // Prefer .env vars — simpler and more secure
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    return nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }

  // Fall back to database SMTP config (set in admin → Settings)
  const settings = await StoreSettings.findOne({ storeId: 'default' })
    .select('+smtp.user +smtp.password').lean();
  const smtp = settings?.smtp;
  if (!smtp?.host || !smtp?.user) {
    throw new Error('SMTP not configured. Add SMTP_HOST, SMTP_USER, SMTP_PASS to your .env file.');
  }
  return nodemailer.createTransport({
    host:   smtp.host,
    port:   smtp.port || 587,
    secure: smtp.secure || false,
    auth:   { user: smtp.user, pass: smtp.password },
  });
}

async function getFromAddress() {
  if (process.env.SMTP_FROM) return process.env.SMTP_FROM;
  const settings = await StoreSettings.findOne({ storeId: 'default' }).lean();
  const name  = settings?.general?.storeName || 'MyShop';
  const email = settings?.smtp?.from || settings?.general?.supportEmail || 'no-reply@example.com';
  return `"${name}" <${email}>`;
}

exports.sendPasswordResetEmail = async ({ toEmail, toName, resetUrl }) => {
  const [transporter, from] = await Promise.all([createTransporter(), getFromAddress()]);
  const storeName = from.match(/"(.+?)"/)?.[1] || 'Our Store';

  await transporter.sendMail({
    from,
    to:      `"${toName}" <${toEmail}>`,
    subject: `Reset your password — ${storeName}`,
    html:    buildPasswordResetHtml({ storeName, toName, resetUrl }),
  });
};

function buildPasswordResetHtml({ storeName, toName, resetUrl }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Reset Your Password</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#111;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;max-width:600px;width:100%;">
        <tr>
          <td style="padding:36px 48px 28px;border-bottom:2px solid #111;">
            <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;">${storeName}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 48px 28px;">
            <h1 style="margin:0 0 10px;font-size:26px;font-weight:300;letter-spacing:-.02em;">Reset your password</h1>
            <p style="margin:0 0 32px;font-size:13px;color:#666;line-height:1.6;">
              Hi ${toName}, we received a request to reset your password. Click the button below to set a new one. This link expires in <strong style="color:#111;">10 minutes</strong>.
            </p>
            <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
              <tr>
                <td style="background:#111;">
                  <a href="${resetUrl}" style="display:inline-block;padding:15px 36px;font-size:11px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#fff;text-decoration:none;">
                    Reset Password
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0;font-size:12px;color:#999;line-height:1.8;">
              If you didn't request this, you can safely ignore this email — your password won't change.<br><br>
              Or paste this link in your browser:<br>
              <a href="${resetUrl}" style="color:#111;font-weight:600;word-break:break-all;">${resetUrl}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 48px;border-top:1px solid #ebebeb;">
            <p style="margin:0;font-size:11px;color:#bbb;text-align:center;line-height:1.8;">
              Thank you for shopping with ${storeName}.<br>
              Questions? Simply reply to this email.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

exports.sendOrderConfirmationEmail = async ({ toEmail, toName, order }) => {
  const [transporter, from] = await Promise.all([createTransporter(), getFromAddress()]);

  const storeName  = from.match(/"(.+?)"/)?.[1] || 'Our Store';
  const storeFront = process.env.STOREFRONT_URL || 'http://localhost:5173';
  const orderUrl   = `${storeFront}/account/orders/${order._id}`;

  await transporter.sendMail({
    from,
    to:      `"${toName}" <${toEmail}>`,
    subject: `Order confirmed — ${order.orderNumber}`,
    html:    buildConfirmationHtml({ order, storeName, orderUrl, toName }),
  });
};

function buildConfirmationHtml({ order, storeName, orderUrl, toName }) {
  const rows = (order.items || []).map(item => `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid #ebebeb;font-size:13px;color:#111;">${item.name}${item.sku ? `<br><span style="font-size:10px;color:#aaa;letter-spacing:.05em;">${item.sku}</span>` : ''}</td>
      <td style="padding:14px 0;border-bottom:1px solid #ebebeb;font-size:13px;text-align:center;color:#666;">×${item.quantity}</td>
      <td style="padding:14px 0;border-bottom:1px solid #ebebeb;font-size:13px;font-weight:600;text-align:right;color:#111;">₹${(item.price * item.quantity).toFixed(2)}</td>
    </tr>`).join('');

  const addr   = order.shippingAddress || {};
  const addrStr = [addr.line1, addr.line2, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Order Confirmed</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#111;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="padding:36px 48px 28px;border-bottom:2px solid #111;">
            <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;">${storeName}</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px 48px 28px;">
            <h1 style="margin:0 0 10px;font-size:26px;font-weight:300;letter-spacing:-.02em;">Order confirmed</h1>
            <p style="margin:0 0 32px;font-size:13px;color:#666;line-height:1.6;">
              Hi ${toName}, thank you for your order. We've received it and will begin processing shortly.
            </p>

            <!-- Order reference -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;margin-bottom:32px;">
              <tr>
                <td style="padding:20px 28px;">
                  <p style="margin:0 0 4px;font-size:9px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#999;">Order Number</p>
                  <p style="margin:0;font-size:20px;font-weight:700;letter-spacing:.04em;color:#111;">${order.orderNumber}</p>
                </td>
              </tr>
            </table>

            <!-- Items -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <thead>
                <tr>
                  <th style="font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#aaa;padding-bottom:10px;border-bottom:2px solid #111;text-align:left;">Item</th>
                  <th style="font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#aaa;padding-bottom:10px;border-bottom:2px solid #111;text-align:center;">Qty</th>
                  <th style="font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#aaa;padding-bottom:10px;border-bottom:2px solid #111;text-align:right;">Amount</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>

            <!-- Total -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
              ${order.shippingCost > 0 ? `<tr><td style="padding:6px 0;font-size:12px;color:#888;">Shipping</td><td style="padding:6px 0;font-size:12px;text-align:right;color:#888;">₹${Number(order.shippingCost).toFixed(2)}</td></tr>` : ''}
              ${order.tax > 0 ? `<tr><td style="padding:6px 0;font-size:12px;color:#888;">Tax</td><td style="padding:6px 0;font-size:12px;text-align:right;color:#888;">₹${Number(order.tax).toFixed(2)}</td></tr>` : ''}
              ${order.discount > 0 ? `<tr><td style="padding:6px 0;font-size:12px;color:#888;">Discount</td><td style="padding:6px 0;font-size:12px;text-align:right;color:#dc2626;">−₹${Number(order.discount).toFixed(2)}</td></tr>` : ''}
              <tr>
                <td style="padding:12px 0;font-size:14px;font-weight:700;border-top:2px solid #111;">Total</td>
                <td style="padding:12px 0;font-size:20px;font-weight:700;text-align:right;border-top:2px solid #111;">₹${Number(order.total).toFixed(2)}</td>
              </tr>
            </table>

            ${addrStr ? `<!-- Shipping address -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;margin-bottom:32px;">
              <tr>
                <td style="padding:20px 28px;">
                  <p style="margin:0 0 4px;font-size:9px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#999;">Shipping To</p>
                  <p style="margin:0;font-size:13px;font-weight:600;color:#111;">${addr.name || toName}</p>
                  <p style="margin:4px 0 0;font-size:12px;color:#666;line-height:1.6;">${addrStr}</p>
                </td>
              </tr>
            </table>` : ''}

            <!-- CTA -->
            <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
              <tr>
                <td style="background:#111;">
                  <a href="${orderUrl}"
                     style="display:inline-block;padding:15px 36px;font-size:11px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#fff;text-decoration:none;">
                    View Order
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0;font-size:12px;color:#999;line-height:1.8;">
              You'll receive another email with tracking details once your order ships.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 48px;border-top:1px solid #ebebeb;">
            <p style="margin:0;font-size:11px;color:#bbb;text-align:center;line-height:1.8;">
              Thank you for shopping with ${storeName}.<br>
              Questions? Simply reply to this email.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

exports.sendTrackingEmail = async ({ toEmail, toName, order }) => {
  const [transporter, from] = await Promise.all([createTransporter(), getFromAddress()]);

  const storeName   = from.match(/"(.+?)"/)?.[1] || 'Our Store';
  const storeFront  = process.env.STOREFRONT_URL || 'http://localhost:5173';
  const awb         = order.awbCode || order.trackingNumber;
  const trackUrl    = `${storeFront}/track/${awb}`;

  await transporter.sendMail({
    from,
    to:      `"${toName}" <${toEmail}>`,
    subject: `Your order ${order.orderNumber} is on its way!`,
    html:    buildTrackingHtml({ order, storeName, awb, trackUrl, toName }),
  });
};

function buildTrackingHtml({ order, storeName, awb, trackUrl, toName }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Your order is on its way</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#111;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="padding:36px 48px 28px;border-bottom:2px solid #111;">
            <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;">${storeName}</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px 48px;">
            <h1 style="margin:0 0 10px;font-size:26px;font-weight:300;letter-spacing:-.02em;">Your order is on its way</h1>
            <p style="margin:0 0 32px;font-size:13px;color:#666;line-height:1.6;">
              Hi ${toName}, your order <strong style="color:#111;">${order.orderNumber}</strong> has been shipped and is heading your way.
            </p>

            <!-- Tracking Box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;margin-bottom:28px;">
              <tr>
                <td style="padding:24px 28px;">
                  <p style="margin:0 0 4px;font-size:9px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#999;">Tracking Number</p>
                  <p style="margin:0 0 20px;font-size:24px;font-weight:700;letter-spacing:.06em;color:#111;">${awb}</p>
                  <p style="margin:0 0 4px;font-size:9px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#999;">Shipped via</p>
                  <p style="margin:0;font-size:13px;font-weight:600;color:#111;">${order.courierName || 'Shiprocket'}</p>
                </td>
              </tr>
            </table>

            <!-- CTA -->
            <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
              <tr>
                <td style="background:#111;">
                  <a href="${trackUrl}"
                     style="display:inline-block;padding:15px 36px;font-size:11px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#fff;text-decoration:none;">
                    Track Your Order
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0;font-size:12px;color:#999;line-height:1.8;">
              Or paste this link in your browser:<br>
              <a href="${trackUrl}" style="color:#111;font-weight:600;word-break:break-all;">${trackUrl}</a>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 48px;border-top:1px solid #ebebeb;">
            <p style="margin:0;font-size:11px;color:#bbb;text-align:center;line-height:1.8;">
              Thank you for shopping with ${storeName}.<br>
              Questions? Simply reply to this email.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
