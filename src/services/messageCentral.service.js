const StoreSettings = require('../models/StoreSettings');

const MC_BASE = 'https://cpaas.messagecentral.com';

// Demo bypass — skip real API for this number
const DEMO_PHONE = '1234567890';
const DEMO_OTP   = '1234';
const DEMO_VERIFICATION_ID = 'DEMO-BYPASS-ID';

async function getConfig() {
  const settings = await StoreSettings.findOne({ storeId: 'default' })
    .select('+sms.customerId +sms.authToken')
    .lean();

  const customerId = settings?.sms?.customerId || process.env.MESSAGE_CENTRAL_CUSTOMER_ID;
  const authToken  = settings?.sms?.authToken  || process.env.MESSAGE_CENTRAL_AUTH_TOKEN;

  if (!customerId || !authToken) {
    throw new Error('Message Central is not configured. Please add credentials in admin settings.');
  }
  return { customerId, authToken };
}

exports.sendOtp = async (phone, countryCode = '91') => {
  if (phone === DEMO_PHONE) return DEMO_VERIFICATION_ID;

  const { customerId, authToken } = await getConfig();

  const url = `${MC_BASE}/verification/v3/send?countryCode=${countryCode}&customerId=${customerId}&flowType=SMS&mobileNumber=${phone}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { authToken, 'Content-Type': 'application/json' },
  });

  const data = await res.json();

  if (!res.ok || data.responseCode !== 200) {
    throw new Error(data.message || 'Failed to send OTP');
  }

  return data.data.verificationId;
};

exports.verifyOtp = async (verificationId, code) => {
  if (verificationId === DEMO_VERIFICATION_ID) return code === DEMO_OTP;

  const { customerId, authToken } = await getConfig();

  const url = `${MC_BASE}/verification/v3/validateOtp?verificationId=${verificationId}&code=${code}&customerId=${customerId}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { authToken },
  });

  const data = await res.json();

  if (!res.ok || data.responseCode !== 200) {
    throw new Error(data.message || 'OTP verification failed');
  }

  return data.data.verificationStatus === 'VERIFICATION_COMPLETED';
};
