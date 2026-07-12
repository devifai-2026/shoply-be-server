require('dotenv').config();
const { OwnerUser } = require('./models/control');

// Seeds the platform-owner (PO console) login. Run: node src/seed-owner.js
(async () => {
  const email    = process.env.OWNER_EMAIL    || 'owner@shoply.dev';
  const password = process.env.OWNER_PASSWORD || 'owner12345';
  try {
    const existing = await OwnerUser.findOne({ email });
    if (existing) {
      console.log(`Owner ${email} already exists.`);
    } else {
      await OwnerUser.create({ email, name: 'Platform Owner', password });
      console.log(`Owner created: ${email} / ${password}`);
    }
  } catch (err) {
    console.error('Seed owner failed:', err.message);
  } finally {
    process.exit(0);
  }
})();
