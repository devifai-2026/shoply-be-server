const mongoose = require('mongoose');

const appearanceSchema = new mongoose.Schema({
  storeId: { type: String, default: 'default', unique: true },

  colors: {
    primary:   { type: String, default: '#3B8BD4' },
    secondary: { type: String, default: '#F0997B' },
    sale:      { type: String, default: '#E24B4A' },
    success:   { type: String, default: '#1D9E75' },
    bg:        { type: String, default: '#FFFFFF' },
    text:      { type: String, default: '#1A1A1A' },
    surface:   { type: String, default: '#FFFFFF' },
    card:      { type: String, default: '#F7F7F9' },
    border:    { type: String, default: '#E5E7EB' },
    mutedText: { type: String, default: '#6B7280' },
    onPrimary: { type: String, default: '#FFFFFF' },
    badge:     { type: String, default: '#F59E0B' },
    rating:    { type: String, default: '#F59E0B' },
    danger:    { type: String, default: '#DC2626' },
  },

  darkColors: {
    primary:   { type: String, default: '#3B8BD4' },
    secondary: { type: String, default: '#F0997B' },
    sale:      { type: String, default: '#E24B4A' },
    success:   { type: String, default: '#1D9E75' },
    bg:        { type: String, default: '#0B0B0F' },
    text:      { type: String, default: '#F5F5F7' },
    surface:   { type: String, default: '#16161C' },
    card:      { type: String, default: '#1E1E26' },
    border:    { type: String, default: '#2A2A33' },
    mutedText: { type: String, default: '#9CA3AF' },
    onPrimary: { type: String, default: '#FFFFFF' },
    badge:     { type: String, default: '#F59E0B' },
    rating:    { type: String, default: '#F59E0B' },
    danger:    { type: String, default: '#DC2626' },
  },

  typography: {
    headingFont:  { type: String, default: 'sans' },
    bodyFont:     { type: String, default: 'sans' },
    baseSize:     { type: Number, default: 15 },
    buttonCorner: { type: String, default: 'sharp' },
  },

  layout: {
    webColumns:     { type: Number, default: 3 },
    appColumns:     { type: Number, default: 2 },
    maxWidth:       { type: Number, default: 1280 },
    sectionSpacing: { type: Number, default: 48 },
  },

  homepageSections: {
    heroBanner:       { type: Boolean, default: true },
    featuredProducts: { type: Boolean, default: true },
    categoriesGrid:   { type: Boolean, default: true },
    flashSale:        { type: Boolean, default: false },
    newArrivals:      { type: Boolean, default: true },
    newsletter:       { type: Boolean, default: true },
  },

  header: {
    sticky:          { type: Boolean, default: true },
    categoryBar:     { type: Boolean, default: true },
    transparentHero: { type: Boolean, default: false },
  },

  footer: {
    paymentIcons:     { type: Boolean, default: true },
    socialLinks:      { type: Boolean, default: true },
    appBadges:        { type: Boolean, default: false },
    footerNewsletter: { type: Boolean, default: true },
  },

  homepageContent: {
    promoStrip: { type: String, default: 'Free shipping on orders over $500 · Secure checkout · Easy returns' },
    promoBanners: {
      type: [{
        subtitle: { type: String, default: '' },
        title:    { type: String, default: '' },
        cta:      { type: String, default: 'Shop Now' },
        link:     { type: String, default: '/products' },
        image:    { type: String, default: null },
      }],
      default: [
        { subtitle: 'New Season',       title: 'Gear Up for the Crag',   cta: 'Shop Now', link: '/products', image: null },
        { subtitle: 'Performance Tech', title: 'Alpine Ready Apparel',    cta: 'Explore',  link: '/products', image: null },
      ],
      validate: { validator: (v) => v.length <= 5, message: 'Maximum 5 banners allowed' },
    },
  },

  productCardStyle: { type: String, default: 'minimal' },

  logo:    { type: String, default: null },
  favicon: { type: String, default: null },
  appIcon: { type: String, default: null },

  customCSS: {
    web: { type: String, default: '' },
    app: { type: String, default: '' },
  },
}, { timestamps: true });

module.exports = mongoose.model('Appearance', appearanceSchema);
