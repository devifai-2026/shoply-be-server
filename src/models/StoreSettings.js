const mongoose = require('mongoose');

const storeSettingsSchema = new mongoose.Schema({
  storeId: { type: String, default: 'default', unique: true },

  general: {
    storeName:    { type: String, default: 'MyShop' },
    supportEmail: { type: String, default: '' },
    phone:        { type: String, default: '' },
    industry:     { type: String, default: 'Fashion & Apparel' },
    address:      { type: String, default: '' },
    logoUrl:      { type: String, default: null },
    faviconUrl:   { type: String, default: null },
  },

  regional: {
    currency:       { type: String, default: 'INR' },
    currencySymbol: { type: String, default: '₹' },
    symbolPosition: { type: String, enum: ['left', 'right', 'left_space'], default: 'left' },
    timezone:       { type: String, default: 'Asia/Kolkata' },
    dateFormat:     { type: String, default: 'DD/MM/YYYY' },
    language:       { type: String, default: 'en' },
  },

  operational: {
    storefrontActive: { type: Boolean, default: true },
    appsActive:       { type: Boolean, default: true },
    maintenance:      { type: Boolean, default: false },
    maintenanceMsg:   { type: String, default: 'We are under maintenance. Back soon.' },
    guestCheckout:    { type: Boolean, default: true },
    autoReduceStock:  { type: Boolean, default: true },
  },

  seo: {
    defaultTitle:    { type: String, default: '' },
    titleSuffix:     { type: String, default: '' },
    defaultDesc:     { type: String, default: '' },
    keywords:        { type: String, default: '' },
    gaId:            { type: String, default: '' },
    fbPixelId:       { type: String, default: '' },
    searchIndexing:  { type: Boolean, default: true },
    xmlSitemap:      { type: Boolean, default: true },
    canonicalUrls:   { type: Boolean, default: false },
    openGraph:       { type: Boolean, default: true },
  },

  orders: {
    autoConfirm:         { type: Boolean, default: false },
    emailInvoice:        { type: Boolean, default: true },
    taxIncluded:         { type: Boolean, default: false },
    allowCancel:         { type: Boolean, default: true },
    invoicePrefix:       { type: String, default: 'INV-' },
    invoiceStartNumber:  { type: Number, default: 1001 },
    gstRate:             { type: Number, default: 18 },
    minOrderAmount:      { type: Number, default: 0 },
    cancellationWindow:  { type: String, default: '24 hours' },
    refundMethod:        { type: String, default: 'Original payment method' },
  },

  social: {
    facebook:  { type: String, default: '' },
    instagram: { type: String, default: '' },
    twitter:   { type: String, default: '' },
    youtube:   { type: String, default: '' },
    whatsapp:  { type: String, default: '' },
    tiktok:    { type: String, default: '' },
    shareTemplate: { type: String, default: 'Check out this product from {storeName}!' },
    referralBonus: { type: Number, default: 50 },
    googleLogin:   { type: Boolean, default: true },
    facebookLogin: { type: Boolean, default: false },
    appleLogin:    { type: Boolean, default: false },
  },

  shipping: {
    weightEnabled:  { type: Boolean, default: false },
    baseWeight:     { type: Number, default: 1 },
    extraChargePerKg: { type: Number, default: 20 },
    showEstimatedDelivery: { type: Boolean, default: true },
    metroDeliveryTime: { type: String, default: '1-2 Days' },
    restOfCountryTime: { type: String, default: '4-7 Days' },
  },

  reviews: {
    autoApprove:    { type: Boolean, default: false },
    guestReviews:   { type: Boolean, default: true },
    photoUploads:   { type: Boolean, default: true },
    emailNotifs:    { type: Boolean, default: true },
  },

  smtp: {
    host:     { type: String, default: '' },
    port:     { type: Number, default: 587 },
    secure:   { type: Boolean, default: false },
    user:     { type: String, default: '', select: false },
    password: { type: String, default: '', select: false },
    from:     { type: String, default: '' },
  },

  sms: {
    customerId: { type: String, default: '', select: false },
    authToken:  { type: String, default: '', select: false },
  },
}, { timestamps: true });

module.exports = mongoose.model('StoreSettings', storeSettingsSchema);
