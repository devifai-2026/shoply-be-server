const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const adminSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 6, select: false },
  role:     { type: String, enum: ['superadmin', 'admin', 'manager'], default: 'admin' },
  avatar:   { type: String, default: null },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

adminSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

adminSchema.methods.matchPassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

adminSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

// Default-connection model — the single shared `ecom.Admin` collection,
// preserved for any request that doesn't resolve to a tenant subdomain.
const AdminDefault = mongoose.model('Admin', adminSchema);

// Per-tenant-connection resolver. Each mongoose Connection keeps its own model
// registry, so registering 'Admin' on a tenant connection never collides with
// the default connection's registration (OverwriteModelError only happens when
// re-registering on the SAME connection).
function getAdminModel(conn) {
  if (!conn) return AdminDefault;
  return conn.models.Admin || conn.model('Admin', adminSchema);
}

module.exports = AdminDefault;
module.exports.getAdminModel = getAdminModel;
