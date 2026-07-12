const { getControlDb } = require('../../config/controlDb');
const { encrypt, decrypt } = require('../../utils/secretCrypto');
const bcrypt = require('bcryptjs');

const { Schema } = require('mongoose');

// ─── Tenant ─────────────────────────────────────────────────────────────────
const tenantSchema = new Schema({
  slug:   { type: String, required: true, unique: true, lowercase: true, immutable: true },
  name:   { type: String, required: true },
  status: { type: String, enum: ['provisioning', 'active', 'suspended', 'deleted'], default: 'provisioning' },

  // DB isolation: default cluster (DB-per-tenant on the shared cluster) or a
  // fully custom URI stored encrypted in TenantSecret.
  dbName:             { type: String, required: true },
  dbOnDefaultCluster: { type: Boolean, default: true },

  domains: [{ type: String }],
  branding: {
    displayName:  { type: String, default: '' },
    logoUrl:      { type: String, default: '' },
    primaryColor: { type: String, default: '#6D28D9' },
  },
  // Buyer app
  android: {
    applicationId: { type: String, default: '' },
    appLabel:      { type: String, default: '' },
  },
  // Seller app (derived from buyer package id + ".seller" unless set)
  androidSeller: {
    applicationId: { type: String, default: '' },
    appLabel:      { type: String, default: '' },
  },
}, { timestamps: true });

// ─── TenantSecret (encrypted) ─────────────────────────────────────────────────
const encField = {
  type: String,
  default: '',
  set: (v) => encrypt(v),
};
const tenantSecretSchema = new Schema({
  tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true },
  slug:   { type: String, required: true },
  dbUri:  encField, // full per-tenant Mongo URI when dbOnDefaultCluster = false
}, { timestamps: true });
tenantSecretSchema.methods.decrypted = function (field) {
  return decrypt(this[field]);
};

// ─── Keystore (Android signing) ───────────────────────────────────────────────
// A single platform keystore signs all tenant builds (like Meesho / the
// rg-phase-2 reference). Stored encrypted; CI pulls it at build time.
const keystoreSchema = new Schema({
  name:          { type: String, default: 'platform' },
  fileName:      { type: String, default: 'release.jks' },
  keystoreB64:   encField, // base64 of the .jks, encrypted
  storePassword: encField,
  keyAlias:      { type: String, default: '' },
  keyPassword:   encField,
  fingerprint:   { type: String, default: '' }, // SHA-256, informational
  isActive:      { type: Boolean, default: true },
}, { timestamps: true });
keystoreSchema.methods.decrypted = function (field) {
  return decrypt(this[field]);
};

// ─── BuildJob ─────────────────────────────────────────────────────────────────
const buildJobSchema = new Schema({
  tenant:        { type: String, required: true }, // slug
  app:           { type: String, default: 'user' },
  artifact:      { type: String, enum: ['apk', 'aab'], default: 'apk' },
  applicationId: { type: String, default: '' },
  appLabel:      { type: String, default: '' },
  apiBase:       { type: String, default: '' },
  versionName:   { type: String, default: '1.0.0' },
  versionCode:   { type: Number, default: 1 },
  status:        { type: String, enum: ['queued', 'dispatched', 'running', 'succeeded', 'failed'], default: 'queued' },
  artifactUrl:   { type: String, default: '' },
  error:         { type: String, default: '' },
}, { timestamps: true });

// ─── OwnerUser ─────────────────────────────────────────────────────────────────
const ownerUserSchema = new Schema({
  email:    { type: String, required: true, unique: true, lowercase: true },
  name:     { type: String, default: 'Owner' },
  password: { type: String, required: true, select: false },
}, { timestamps: true });
ownerUserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});
ownerUserSchema.methods.matchPassword = function (entered) {
  return bcrypt.compare(entered, this.password);
};

// Bind all models to the control connection
const db = getControlDb();
module.exports = {
  Tenant:       db.model('Tenant', tenantSchema),
  TenantSecret: db.model('TenantSecret', tenantSecretSchema),
  Keystore:     db.model('Keystore', keystoreSchema),
  BuildJob:     db.model('BuildJob', buildJobSchema),
  OwnerUser:    db.model('OwnerUser', ownerUserSchema),
};
