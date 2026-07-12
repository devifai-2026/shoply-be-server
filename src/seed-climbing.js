require('dotenv').config();
const mongoose   = require('mongoose');
const connectDB  = require('./config/db');
const Category   = require('./models/Category');
const Brand      = require('./models/Brand');
const Product    = require('./models/Product');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const upsertCat = async (data) =>
  Category.findOneAndUpdate({ slug: data.slug }, data, { upsert: true, new: true });

const upsertBrand = async (data) =>
  Brand.findOneAndUpdate({ slug: data.slug }, data, { upsert: true, new: true });

let skuCounter = 1000;
const nextSku = (prefix) => `${prefix}-${++skuCounter}`;

const upsertProduct = async (data) =>
  Product.findOneAndUpdate({ sku: data.sku }, data, { upsert: true, new: true });

// ─── Brands ───────────────────────────────────────────────────────────────────

const BRANDS = [
  { name: 'Black Diamond', slug: 'black-diamond', description: 'Leading climbing and mountain sports equipment since 1957.', isActive: true },
  { name: 'Petzl',         slug: 'petzl',         description: 'Vertical world safety equipment and headlamps.', isActive: true },
  { name: 'La Sportiva',   slug: 'la-sportiva',   description: 'Italian performance climbing footwear and apparel.', isActive: true },
  { name: 'Mammut',        slug: 'mammut',         description: 'Swiss precision gear for mountain sports.', isActive: true },
  { name: "Arc'teryx",     slug: 'arcteryx',       description: 'Premium technical outdoor apparel and gear.', isActive: true },
  { name: 'Salomon',       slug: 'salomon',        description: 'Performance footwear and equipment for mountain sports.', isActive: true },
  { name: 'Osprey',        slug: 'osprey',         description: 'Premium technical packs for every adventure.', isActive: true },
  { name: 'Patagonia',     slug: 'patagonia',      description: 'Sustainable outdoor clothing and gear.', isActive: true },
  { name: 'The North Face', slug: 'the-north-face', description: 'Never Stop Exploring. Premium outdoor apparel.', isActive: true },
  { name: 'Edelrid',       slug: 'edelrid',        description: 'German-engineered climbing ropes and hardware.', isActive: true },
  { name: 'Wild Country',  slug: 'wild-country',  description: 'British heritage climbing protection and harnesses.', isActive: true },
  { name: 'Metolius',      slug: 'metolius',       description: 'Rock climbing gear since 1983.', isActive: true },
];

// ─── Seed ─────────────────────────────────────────────────────────────────────

const seed = async () => {
  await connectDB();
  console.log('🌱 Seeding climbing data...\n');

  // ─── Brands ───────────────────────────────────────────────────────────────
  for (const b of BRANDS) await upsertBrand(b);
  console.log(`✔  ${BRANDS.length} brands seeded`);

  // ─── Category Tree ─────────────────────────────────────────────────────────
  // depth 0 → top-level
  // depth 1 → subcategory
  // depth 2 → child subcategory (products live here)

  const tops = [
    { name: 'Clothing',           icon: '🧥', sortOrder: 0 },
    { name: 'Footwear',           icon: '👟', sortOrder: 1 },
    { name: 'Backpacks',          icon: '🎒', sortOrder: 2 },
    { name: 'Rock Climbing',      icon: '🧗', sortOrder: 3 },
    { name: 'Bouldering',         icon: '🪨', sortOrder: 4 },
    { name: 'Sport Climbing',     icon: '🔗', sortOrder: 5 },
    { name: 'Alpine Climbing',    icon: '🏔️', sortOrder: 6 },
    { name: 'Safety & Helmets',   icon: '⛑️', sortOrder: 7 },
    { name: 'Accessories',        icon: '🔦', sortOrder: 8 },
  ];

  const topDocs = {};
  for (const t of tops) {
    const doc = await upsertCat({ name: t.name, slug: slug(t.name), icon: t.icon, depth: 0, sortOrder: t.sortOrder, isActive: true });
    topDocs[t.name] = doc;
  }
  console.log(`✔  ${tops.length} top-level categories`);

  // subcategory helper
  const sub = async (parentName, name, sortOrder = 0) => {
    const parent = topDocs[parentName];
    const doc = await upsertCat({ name, slug: slug(name), icon: '📁', depth: 1, parent: parent._id, sortOrder, isActive: true });
    return doc;
  };

  // child subcategory helper
  const child = async (parentDoc, name, sortOrder = 0) => {
    const doc = await upsertCat({ name, slug: slug(name), icon: '📌', depth: 2, parent: parentDoc._id, sortOrder, isActive: true });
    return doc;
  };

  // ─── Clothing ─────────────────────────────────────────────────────────────
  const jackets    = await sub('Clothing', 'Jackets', 0);
  const baseLayers = await sub('Clothing', 'Base Layers', 1);
  const midlayers  = await sub('Clothing', 'Midlayers', 2);
  const pants      = await sub('Clothing', 'Pants', 3);

  const watJackets  = await child(jackets, 'Waterproof Jackets', 0);
  const downJackets = await child(jackets, 'Down Jackets', 1);
  const pufJackets  = await child(jackets, 'Puffer Jackets', 2);
  const therTop     = await child(baseLayers, 'Thermal Tops', 0);
  const therBot     = await child(baseLayers, 'Thermal Bottoms', 1);
  const fleecJac    = await child(midlayers, 'Fleece Jackets', 0);
  const softJac     = await child(midlayers, 'Softshell Jackets', 1);
  const hardPants   = await child(pants, 'Hardshell Pants', 0);
  const softPants   = await child(pants, 'Softshell Pants', 1);

  // ─── Footwear ─────────────────────────────────────────────────────────────
  const climbShoes   = await sub('Footwear', 'Climbing Shoes', 0);
  const approachShoe = await sub('Footwear', 'Approach Shoes', 1);
  const bootAcc      = await sub('Footwear', 'Boot Accessories', 2);

  const beginShoes = await child(climbShoes, 'Beginner Climbing Shoes', 0);
  const advShoes   = await child(climbShoes, 'Advanced Climbing Shoes', 1);
  const boulShoes  = await child(climbShoes, 'Bouldering Shoes', 2);
  const trailApp   = await child(approachShoe, 'Trail Approach Shoes', 0);
  const hikBoots   = await child(approachShoe, 'Hiking Boots', 1);
  const shoeBags   = await child(bootAcc, 'Shoe Bags', 0);
  const resolKit   = await child(bootAcc, 'Resole Kits', 1);

  // ─── Backpacks ────────────────────────────────────────────────────────────
  const climbPacks = await sub('Backpacks', 'Climbing Packs', 0);
  const hikePacks  = await sub('Backpacks', 'Hiking Packs', 1);
  const haulBags   = await sub('Backpacks', 'Haul Bags', 2);

  const summitPacks = await child(climbPacks, 'Summit Packs', 0);
  const cragPacks   = await child(climbPacks, 'Crag Packs', 1);
  const dayPacks    = await child(hikePacks, 'Day Packs', 0);
  const multiDay    = await child(hikePacks, 'Multi-Day Packs', 1);
  const wallBags    = await child(haulBags, 'Wall Haul Bags', 0);
  const gymBags     = await child(haulBags, 'Gym Bags', 1);

  // ─── Rock Climbing ────────────────────────────────────────────────────────
  const harnesses = await sub('Rock Climbing', 'Harnesses', 0);
  const ropes     = await sub('Rock Climbing', 'Ropes', 1);
  const protec    = await sub('Rock Climbing', 'Protection', 2);
  const crabins   = await sub('Rock Climbing', 'Carabiners', 3);

  const beginHar  = await child(harnesses, 'Beginner Harnesses', 0);
  const sportHar  = await child(harnesses, 'Sport Harnesses', 1);
  const tradHar   = await child(harnesses, 'Trad Harnesses', 2);
  const singleRop = await child(ropes, 'Single Ropes', 0);
  const halfRop   = await child(ropes, 'Half Ropes', 1);
  const cams      = await child(protec, 'Cams', 0);
  const nuts      = await child(protec, 'Nuts & Hexes', 1);
  const lockCrab  = await child(crabins, 'Locking Carabiners', 0);
  const nonLock   = await child(crabins, 'Non-Locking Carabiners', 1);

  // ─── Bouldering ───────────────────────────────────────────────────────────
  const crashPads = await sub('Bouldering', 'Crash Pads', 0);
  const chalkBags = await sub('Bouldering', 'Chalk & Bags', 1);

  const indoorPads  = await child(crashPads, 'Indoor Crash Pads', 0);
  const outdoorPads = await child(crashPads, 'Outdoor Crash Pads', 1);
  const looseChalk  = await child(chalkBags, 'Loose Chalk', 0);
  const chalkBag    = await child(chalkBags, 'Chalk Bags', 1);

  // ─── Sport Climbing ───────────────────────────────────────────────────────
  const belayDevs  = await sub('Sport Climbing', 'Belay Devices', 0);
  const quickdraws = await sub('Sport Climbing', 'Quickdraws', 1);

  const assistedBD  = await child(belayDevs, 'Assisted Braking Devices', 0);
  const tubeDevs    = await child(belayDevs, 'Tube Devices', 1);
  const sportQD     = await child(quickdraws, 'Sport Quickdraws', 0);
  const alpineDraws = await child(quickdraws, 'Alpine Draws', 1);

  // ─── Alpine Climbing ──────────────────────────────────────────────────────
  const iceTools  = await sub('Alpine Climbing', 'Ice Tools', 0);
  const crampons  = await sub('Alpine Climbing', 'Crampons', 1);
  const gaiters   = await sub('Alpine Climbing', 'Gaiters', 2);

  const iceAxes    = await child(iceTools, 'Ice Axes', 0);
  const iceHammers = await child(iceTools, 'Ice Hammers', 1);
  const stepIn     = await child(crampons, 'Step-In Crampons', 0);
  const strapCr    = await child(crampons, 'Strap Crampons', 1);
  const lowGait    = await child(gaiters, 'Low Gaiters', 0);
  const highGait   = await child(gaiters, 'High Gaiters', 1);

  // ─── Safety & Helmets ─────────────────────────────────────────────────────
  const helmets = await sub('Safety & Helmets', 'Helmets', 0);
  const gloves  = await sub('Safety & Helmets', 'Gloves', 1);

  const foamHelm   = await child(helmets, 'Foam Helmets', 0);
  const hybridHelm = await child(helmets, 'Hybrid Helmets', 1);
  const belayGlov  = await child(gloves, 'Belay Gloves', 0);
  const fingerless = await child(gloves, 'Fingerless Gloves', 1);

  // ─── Accessories ──────────────────────────────────────────────────────────
  const headlamps = await sub('Accessories', 'Headlamps', 0);
  const gearOrg   = await sub('Accessories', 'Gear Organisation', 1);

  const trailHL   = await child(headlamps, 'Trail Headlamps', 0);
  const climbHL   = await child(headlamps, 'Climbing Headlamps', 1);
  const gearSling = await child(gearOrg, 'Gear Slings', 0);
  const ropeBags  = await child(gearOrg, 'Rope Bags', 1);

  console.log('✔  Full category tree seeded');

  // ─── Products ─────────────────────────────────────────────────────────────
  // Each entry: [categoryDoc, products array]
  const productSets = [

    // ── Clothing > Jackets ─────────────────────────────────────────────────
    [watJackets, [
      { name: "Arc'teryx Beta AR Jacket", brand: "Arc'teryx", price: 599, discountPrice: 519,
        sku: nextSku('WAT'), stock: 45,
        description: "The ultimate waterproof hardshell for alpine pursuits. 3L GORE-TEX Pro with fully taped seams.",
        attributes: { size: 'M', color: 'Black', material: 'GORE-TEX Pro 3L' },
        tags: ['waterproof', 'hardshell', 'alpine'] },
      { name: 'Mammut Nordwand Pro HS Jacket', brand: 'Mammut', price: 549, discountPrice: 449,
        sku: nextSku('WAT'), stock: 30,
        description: "3-layer GORE-TEX hardshell engineered for demanding alpine routes.",
        attributes: { size: 'L', color: 'Titanium', material: 'GORE-TEX 3L' },
        tags: ['waterproof', 'hardshell', 'alpine'] },
    ]],

    [downJackets, [
      { name: "Arc'teryx Cerium LT Hoody", brand: "Arc'teryx", price: 349, discountPrice: 299,
        sku: nextSku('DWN'), stock: 60,
        description: "Lightweight 850-fill Responsible Down Standard hoody with Coreloft panels in high-movement zones.",
        attributes: { size: 'S', color: 'Nocturnal', material: '850-fill RDS Down' },
        tags: ['down', 'insulated', 'lightweight'] },
      { name: 'Patagonia Down Sweater Hoody', brand: 'Patagonia', price: 279, discountPrice: null,
        sku: nextSku('DWN'), stock: 80,
        description: "Ethically-sourced 800-fill down with recycled ripstop shell. Packable warmth for any adventure.",
        attributes: { size: 'M', color: 'Navy Blue', material: '800-fill Traceable Down' },
        tags: ['down', 'sustainable', 'packable'] },
    ]],

    [pufJackets, [
      { name: 'Black Diamond Stance Belay Parka', brand: 'Black Diamond', price: 299, discountPrice: 249,
        sku: nextSku('PUF'), stock: 50,
        description: "Extra-warm 700-fill down belay parka that fits over harness and layers for cold crags.",
        attributes: { size: 'L', color: 'Granite', material: '700-fill Responsible Down' },
        tags: ['puffer', 'belay', 'warm'] },
      { name: 'The North Face ThermoBall Eco Jacket', brand: 'The North Face', price: 199, discountPrice: 169,
        sku: nextSku('PUF'), stock: 90,
        description: "PrimaLoft ThermoBall synthetic insulation that stays warm even when wet. Packable design.",
        attributes: { size: 'XL', color: 'Forest Night', material: 'ThermoBall Eco Synthetic' },
        tags: ['puffer', 'synthetic', 'packable'] },
    ]],

    [therTop, [
      { name: 'Mammut Comfort Wool Top', brand: 'Mammut', price: 89, discountPrice: 74,
        sku: nextSku('TTH'), stock: 120,
        description: "Merino wool thermal top with flatlock seams. Odour-resistant, moisture-wicking base layer.",
        attributes: { size: 'M', color: 'Light Grey', material: '100% Merino Wool' },
        tags: ['merino', 'base-layer', 'thermal'] },
      { name: 'Patagonia Capilene Thermal Base Layer', brand: 'Patagonia', price: 79, discountPrice: 65,
        sku: nextSku('TTH'), stock: 100,
        description: "Recycled polyester thermal base with diamond-grid fleece interior for warmth and breathability.",
        attributes: { size: 'S', color: 'Black', material: 'Recycled Polyester Fleece' },
        tags: ['synthetic', 'base-layer', 'thermal'] },
    ]],

    [therBot, [
      { name: 'Mammut Comfort Wool Pants', brand: 'Mammut', price: 99, discountPrice: 84,
        sku: nextSku('TBT'), stock: 80,
        description: "Merino wool thermal bottoms. Seamless waistband, comfortable fit for long days on the mountain.",
        attributes: { size: 'M', color: 'Grey', material: '100% Merino Wool' },
        tags: ['merino', 'base-layer', 'thermal'] },
      { name: 'Patagonia Capilene Thermal Bottoms', brand: 'Patagonia', price: 69, discountPrice: null,
        sku: nextSku('TBT'), stock: 95,
        description: "Stretchy recycled polyester thermal bottoms with articulated patterning for freedom of movement.",
        attributes: { size: 'L', color: 'Black', material: 'Recycled Polyester' },
        tags: ['synthetic', 'base-layer', 'thermal'] },
    ]],

    [fleecJac, [
      { name: "Arc'teryx Delta LT Fleece", brand: "Arc'teryx", price: 189, discountPrice: 159,
        sku: nextSku('FLC'), stock: 55,
        description: "Lightweight polartec fleece midlayer with stretch panels for unrestricted movement while climbing.",
        attributes: { size: 'M', color: 'Cobalt Moon', material: 'Polartec Power Stretch' },
        tags: ['fleece', 'midlayer', 'stretch'] },
      { name: 'Mammut Aconcagua ML Hooded Jacket', brand: 'Mammut', price: 169, discountPrice: 139,
        sku: nextSku('FLC'), stock: 70,
        description: "Warm fleece midlayer with helmet-compatible hood and robust Polartec Classic 200 fabric.",
        attributes: { size: 'L', color: 'Black', material: 'Polartec Classic 200' },
        tags: ['fleece', 'midlayer', 'warm'] },
    ]],

    [softJac, [
      { name: 'Black Diamond Coefficient Softshell', brand: 'Black Diamond', price: 229, discountPrice: 199,
        sku: nextSku('SFT'), stock: 40,
        description: "Durable softshell with DWR treatment and 4-way stretch for dynamic climbing movements.",
        attributes: { size: 'M', color: 'Octane', material: 'Schoeller Dryskin' },
        tags: ['softshell', 'midlayer', 'stretch'] },
      { name: 'Salomon Outline Softshell Jacket', brand: 'Salomon', price: 179, discountPrice: 149,
        sku: nextSku('SFT'), stock: 60,
        description: "Versatile softshell with AdvancedSkin Active 5 fabric for wind and light rain protection.",
        attributes: { size: 'L', color: 'Ebony', material: 'AdvancedSkin Active 5' },
        tags: ['softshell', 'midlayer', 'versatile'] },
    ]],

    [hardPants, [
      { name: "Arc'teryx Beta SL Pants", brand: "Arc'teryx", price: 349, discountPrice: 299,
        sku: nextSku('HDP'), stock: 35,
        description: "Lightweight GORE-TEX hardshell pants with helmet-compatible suspenders and gaiters.",
        attributes: { size: 'M', color: 'Black', material: 'GORE-TEX 2.5L' },
        tags: ['hardshell', 'waterproof', 'alpine'] },
      { name: 'Mammut Nordwand HS Pants', brand: 'Mammut', price: 329, discountPrice: 279,
        sku: nextSku('HDP'), stock: 25,
        description: "Full-zip GORE-TEX alpine pants with articulated knees and fully taped seams.",
        attributes: { size: 'L', color: 'Graphite', material: 'GORE-TEX 3L' },
        tags: ['hardshell', 'waterproof', 'alpine'] },
    ]],

    [softPants, [
      { name: 'Black Diamond Crag Pants', brand: 'Black Diamond', price: 149, discountPrice: 119,
        sku: nextSku('SFP'), stock: 65,
        description: "Softshell climbing pants with 4-way stretch and built-in kneepad pocket for high-step moves.",
        attributes: { size: 'M', color: 'Dark Curry', material: 'Schoeller Stretch' },
        tags: ['softshell', 'climbing', 'stretch'] },
      { name: 'Salomon Wayfarer Pants', brand: 'Salomon', price: 129, discountPrice: null,
        sku: nextSku('SFP'), stock: 75,
        description: "Lightweight and packable softshell pants ideal for approach and multi-pitch routes.",
        attributes: { size: 'L', color: 'Black', material: 'Stretch Woven' },
        tags: ['softshell', 'approach', 'packable'] },
    ]],

    // ── Footwear ───────────────────────────────────────────────────────────
    [beginShoes, [
      { name: 'La Sportiva Tarantula', brand: 'La Sportiva', price: 89, discountPrice: 74,
        sku: nextSku('BSH'), stock: 150,
        description: "The perfect beginner climbing shoe with comfortable flat last and lace closure for all-day comfort.",
        attributes: { size: '42', color: 'Brown/Red', material: 'FriXion RS Rubber' },
        tags: ['beginner', 'lace', 'all-round'] },
      { name: 'Mammut Kletterschuh Comfort Knit', brand: 'Mammut', price: 79, discountPrice: 65,
        sku: nextSku('BSH'), stock: 120,
        description: "Knit upper beginner shoe with soft rubber and relaxed fit. Ideal for gym and outdoor beginner routes.",
        attributes: { size: '40', color: 'Chill', material: 'Vibram XS Edge' },
        tags: ['beginner', 'gym', 'comfortable'] },
    ]],

    [advShoes, [
      { name: 'La Sportiva Solution Comp', brand: 'La Sportiva', price: 199, discountPrice: 169,
        sku: nextSku('ASH'), stock: 80,
        description: "Aggressive downturned competition shoe with P3 system for maximum power transfer on overhang.",
        attributes: { size: '41', color: 'White/Yellow', material: 'FriXion White Rubber' },
        tags: ['advanced', 'aggressive', 'competition'] },
      { name: "Black Diamond Zone LV", brand: 'Black Diamond', price: 165, discountPrice: null,
        sku: nextSku('ASH'), stock: 65,
        description: "Moderate downturn with Vibram XS Grip2 for precise footwork on technical face and crack routes.",
        attributes: { size: '43', color: 'Lime', material: 'Vibram XS Grip2' },
        tags: ['advanced', 'technical', 'face-climbing'] },
    ]],

    [boulShoes, [
      { name: 'La Sportiva Skwama', brand: 'La Sportiva', price: 189, discountPrice: 159,
        sku: nextSku('BOS'), stock: 70,
        description: "Highly engineered bouldering shoe with Powerhinge system for explosive heel hooks and precise toe placement.",
        attributes: { size: '40', color: 'Black/Red', material: 'FriXion Black Rubber' },
        tags: ['bouldering', 'aggressive', 'heel-hook'] },
      { name: 'Evolv Shaman', brand: 'Black Diamond', price: 149, discountPrice: 125,
        sku: nextSku('BOS'), stock: 55,
        description: "High-performance bouldering shoe with knit upper and SX Stiky rubber for unparalleled sensitivity.",
        attributes: { size: '42', color: 'Gul/Black', material: 'SX Stiky Rubber' },
        tags: ['bouldering', 'knit', 'sensitive'] },
    ]],

    [trailApp, [
      { name: 'La Sportiva TX5 GTX', brand: 'La Sportiva', price: 219, discountPrice: 189,
        sku: nextSku('TAP'), stock: 60,
        description: "GORE-TEX approach shoe with Vibram Megagrip sole for technical mountain terrain and approach routes.",
        attributes: { size: '43', color: 'Clay/Saffron', material: 'Vibram Megagrip' },
        tags: ['approach', 'gore-tex', 'technical'] },
      { name: 'Salomon X-Chase GTX', brand: 'Salomon', price: 179, discountPrice: 149,
        sku: nextSku('TAP'), stock: 75,
        description: "Versatile trail approach shoe with GORE-TEX waterproofing and Contagrip outsole for grip on any terrain.",
        attributes: { size: '44', color: 'Dark Titanium', material: 'Contagrip' },
        tags: ['approach', 'gore-tex', 'versatile'] },
    ]],

    [hikBoots, [
      { name: 'Mammut Kento Pro High GTX', brand: 'Mammut', price: 289, discountPrice: 249,
        sku: nextSku('HBT'), stock: 45,
        description: "High-cut mountaineering boot with GORE-TEX Pro and compatible with C1/C2 crampons.",
        attributes: { size: '43', color: 'Black/Vibrant Orange', material: 'GORE-TEX Pro' },
        tags: ['hiking', 'mountaineering', 'crampon-compatible'] },
      { name: "Arc'teryx Bora2 Mid GTX", brand: "Arc'teryx", price: 239, discountPrice: 199,
        sku: nextSku('HBT'), stock: 55,
        description: "Lightweight mid-height hiking boot with GORE-TEX and Vibram Megagrip for all-season use.",
        attributes: { size: '42', color: 'Black', material: 'Vibram Megagrip' },
        tags: ['hiking', 'lightweight', 'all-season'] },
    ]],

    [shoeBags, [
      { name: 'Black Diamond Shoe Pod', brand: 'Black Diamond', price: 18, discountPrice: null,
        sku: nextSku('SBG'), stock: 200,
        description: "Durable mesh shoe bag to protect climbing shoes during transit and storage.",
        attributes: { size: 'One Size', color: 'Black', material: 'Mesh Nylon' },
        tags: ['accessory', 'shoe-bag', 'storage'] },
      { name: 'La Sportiva Shoe Bag', brand: 'La Sportiva', price: 22, discountPrice: null,
        sku: nextSku('SBG'), stock: 180,
        description: "Breathable climbing shoe bag with drawstring closure and rubber sole wipe zone.",
        attributes: { size: 'One Size', color: 'Red', material: 'Breathable Mesh' },
        tags: ['accessory', 'shoe-bag', 'breathable'] },
    ]],

    [resolKit, [
      { name: 'Vibram Resole Sheet', brand: 'La Sportiva', price: 35, discountPrice: null,
        sku: nextSku('RSK'), stock: 100,
        description: "Vibram XS Grip rubber sheet for DIY resoling climbing shoes. Covers 1-2 pairs.",
        attributes: { size: '3mm sheet', color: 'Black', material: 'Vibram XS Grip' },
        tags: ['resole', 'diy', 'repair'] },
      { name: 'Gear Aid Freesole Urethane Repair', brand: 'Black Diamond', price: 12, discountPrice: null,
        sku: nextSku('RSK'), stock: 150,
        description: "Professional-grade urethane shoe repair adhesive for rand and rand repairs.",
        attributes: { size: '28g tube', color: 'Clear', material: 'Urethane Adhesive' },
        tags: ['repair', 'adhesive', 'shoe'] },
    ]],

    // ── Backpacks ─────────────────────────────────────────────────────────
    [summitPacks, [
      { name: 'Black Diamond Speed 40', brand: 'Black Diamond', price: 219, discountPrice: 189,
        sku: nextSku('SMP'), stock: 40,
        description: "Lightweight 40L alpine pack with removable framesheet, dual ice axe loops, and helmet attachment.",
        attributes: { size: '40L', color: 'Octane', material: 'Dyneema Nylon' },
        tags: ['summit', 'alpine', 'lightweight'] },
      { name: 'Mammut Trion 38', brand: 'Mammut', price: 199, discountPrice: 169,
        sku: nextSku('SMP'), stock: 35,
        description: "Technical alpine pack with Aircomfort back system, crampon attachment and rope carrier.",
        attributes: { size: '38L', color: 'Black-Phantom', material: 'Ripstop Nylon' },
        tags: ['summit', 'alpine', 'technical'] },
    ]],

    [cragPacks, [
      { name: 'Black Diamond Creek 35', brand: 'Black Diamond', price: 179, discountPrice: 149,
        sku: nextSku('CGP'), stock: 55,
        description: "35L crag pack with rope tarp, gear sling straps, and padded laptop sleeve for the modern climber.",
        attributes: { size: '35L', color: 'Ultra Blue', material: 'Ripstop Nylon' },
        tags: ['crag', 'sport-climbing', 'organiser'] },
      { name: 'Osprey Mutant 38', brand: 'Osprey', price: 199, discountPrice: 169,
        sku: nextSku('CGP'), stock: 45,
        description: "Alpine assult pack with auto-pivot hipbelt and floating top lid. Ideal for single-day alpine routes.",
        attributes: { size: '38L', color: 'Tungsten Grey', material: 'Bluesign Nylon' },
        tags: ['crag', 'alpine', 'versatile'] },
    ]],

    [dayPacks, [
      { name: 'Osprey Talon 22', brand: 'Osprey', price: 119, discountPrice: 99,
        sku: nextSku('DYP'), stock: 80,
        description: "22L technical day pack with AirSpeed suspension and hydration sleeve for trail running and hiking.",
        attributes: { size: '22L', color: 'Volcanic', material: 'Recycled Nylon' },
        tags: ['day-pack', 'hiking', 'trail'] },
      { name: 'Salomon XT 10 Day Pack', brand: 'Salomon', price: 99, discountPrice: 84,
        sku: nextSku('DYP'), stock: 90,
        description: "10L trail pack with integrated poles carry system and reflective detailing for fast-and-light style.",
        attributes: { size: '10L', color: 'Black', material: 'Ripstop' },
        tags: ['day-pack', 'trail', 'light'] },
    ]],

    [multiDay, [
      { name: 'Osprey Atmos AG 65', brand: 'Osprey', price: 279, discountPrice: 239,
        sku: nextSku('MDP'), stock: 35,
        description: "Award-winning 65L trekking pack with Anti-Gravity suspension for maximum comfort on multi-day routes.",
        attributes: { size: '65L', color: 'Rigby Red', material: 'Bluesign Nylon' },
        tags: ['multi-day', 'trekking', 'anti-gravity'] },
      { name: 'Mammut Ducan Spine 50+7', brand: 'Mammut', price: 249, discountPrice: 209,
        sku: nextSku('MDP'), stock: 28,
        description: "Trail running inspired 50+7L pack with Aircomfort Vari-Flex hipbelt and integrated rain cover.",
        attributes: { size: '50+7L', color: 'Sunlight', material: 'Recycled Polyamide' },
        tags: ['multi-day', 'trekking', 'rain-cover'] },
    ]],

    [wallBags, [
      { name: 'Black Diamond Big Gun Haul Bag 70L', brand: 'Black Diamond', price: 249, discountPrice: null,
        sku: nextSku('WLB'), stock: 20,
        description: "Heavy-duty 70L haul bag with polyurethane-coated abrasion-resistant bottom for big wall climbing.",
        attributes: { size: '70L', color: 'Black', material: 'Ballistic Nylon' },
        tags: ['haul-bag', 'big-wall', 'heavy-duty'] },
      { name: 'Metolius Big Wall Tool Roll', brand: 'Metolius', price: 79, discountPrice: null,
        sku: nextSku('WLB'), stock: 30,
        description: "Compact tool organisation bag that attaches to haul bags for rack sorting on big wall routes.",
        attributes: { size: 'One Size', color: 'Assorted', material: 'Cordura Nylon' },
        tags: ['haul-bag', 'big-wall', 'organiser'] },
    ]],

    [gymBags, [
      { name: "Arc'teryx Blade 20 Duffel", brand: "Arc'teryx", price: 149, discountPrice: 119,
        sku: nextSku('GYB'), stock: 60,
        description: "Sleek 20L duffel with padded laptop pocket and shoe compartment for gym sessions.",
        attributes: { size: '20L', color: 'Black', material: 'Dry Nylon' },
        tags: ['gym', 'duffel', 'padded'] },
      { name: 'Black Diamond Gym Duffel 30', brand: 'Black Diamond', price: 89, discountPrice: 74,
        sku: nextSku('GYB'), stock: 75,
        description: "30L padded duffel with separate shoe compartment and mesh pockets for gym climbing essentials.",
        attributes: { size: '30L', color: 'Slate Blue', material: 'Ripstop Nylon' },
        tags: ['gym', 'duffel', 'shoe-compartment'] },
    ]],

    // ── Rock Climbing ─────────────────────────────────────────────────────
    [beginHar, [
      { name: 'Black Diamond Momentum Harness', brand: 'Black Diamond', price: 65, discountPrice: 55,
        sku: nextSku('BHR'), stock: 120,
        description: "All-around beginner harness with pre-threaded Speed Adjust buckles and Dual Core Construction waistbelt.",
        attributes: { size: 'M', color: 'Slate Blue', material: 'Nylon/Polyester' },
        tags: ['beginner', 'all-round', 'gym'] },
      { name: 'Petzl Corax Harness', brand: 'Petzl', price: 59, discountPrice: 49,
        sku: nextSku('BHR'), stock: 100,
        description: "Versatile beginner harness with 4 gear loops and DoubleBack buckle system for gym and outdoor use.",
        attributes: { size: 'L', color: 'Black', material: 'Nylon' },
        tags: ['beginner', 'versatile', 'gym'] },
    ]],

    [sportHar, [
      { name: 'Black Diamond Solution Harness', brand: 'Black Diamond', price: 99, discountPrice: 84,
        sku: nextSku('SPH'), stock: 80,
        description: "Performance sport climbing harness with Fusion Comfort Technology waistbelt and 4 gear loops.",
        attributes: { size: 'M', color: 'Vibrant Orange', material: 'Nylon/Polyester' },
        tags: ['sport', 'performance', 'light'] },
      { name: 'Mammut Ophir 3 Slide Harness', brand: 'Mammut', price: 89, discountPrice: 74,
        sku: nextSku('SPH'), stock: 65,
        description: "Comfortable sport harness with slide adjustment on waist and legs for precise fit.",
        attributes: { size: 'L', color: 'Black/Fire', material: 'Nylon' },
        tags: ['sport', 'slide-adjust', 'comfortable'] },
    ]],

    [tradHar, [
      { name: "Black Diamond Technician Harness", brand: 'Black Diamond', price: 119, discountPrice: 99,
        sku: nextSku('TRH'), stock: 50,
        description: "Full-featured trad harness with 6 gear loops, haul loop, and padded Dual Core waistbelt.",
        attributes: { size: 'M', color: 'Ultramarine', material: 'Nylon/Polyester' },
        tags: ['trad', 'gear-loops', 'haul'] },
      { name: 'Petzl Adjama Harness', brand: 'Petzl', price: 109, discountPrice: null,
        sku: nextSku('TRH'), stock: 40,
        description: "All-around trad harness with DoubleBack buckles, 4 gear loops, and comfortable rigid waistbelt.",
        attributes: { size: 'L', color: 'Black/Grey', material: 'Nylon' },
        tags: ['trad', 'all-round', 'versatile'] },
    ]],

    [singleRop, [
      { name: 'Mammut Crag Classic 10mm 60m', brand: 'Mammut', price: 159, discountPrice: 134,
        sku: nextSku('SRP'), stock: 45,
        description: "Dry-treated 10mm single rope with bi-pattern middle mark. Ideal for sport and trad climbing.",
        attributes: { size: '60m', color: 'Violet', material: 'Nylon UIAA Dry' },
        tags: ['single-rope', 'dry', 'sport-trad'] },
      { name: 'Edelrid Swift Eco Dry 8.9mm 70m', brand: 'Edelrid', price: 189, discountPrice: 159,
        sku: nextSku('SRP'), stock: 35,
        description: "Sustainable 8.9mm single rope with biodegradable dry treatment and bi-directional pattern.",
        attributes: { size: '70m', color: 'Cobalt/Snow', material: 'Nylon Eco Dry' },
        tags: ['single-rope', 'eco', 'lightweight'] },
    ]],

    [halfRop, [
      { name: 'Mammut Twilight 7.5mm 60m Twin', brand: 'Mammut', price: 169, discountPrice: null,
        sku: nextSku('HRP'), stock: 25,
        description: "Ultra-light 7.5mm half rope for trad and alpine climbing. Use two strands for extended fall factor.",
        attributes: { size: '60m', color: 'Safety Orange', material: 'Nylon UIAA Dry' },
        tags: ['half-rope', 'trad', 'alpine'] },
      { name: 'Edelrid Falcon 8mm 60m Half', brand: 'Edelrid', price: 149, discountPrice: 124,
        sku: nextSku('HRP'), stock: 20,
        description: "8mm half rope optimised for multi-pitch and trad routes with reduced drag on wandering pitches.",
        attributes: { size: '60m', color: 'Red/Black', material: 'Nylon Dry Treated' },
        tags: ['half-rope', 'trad', 'multi-pitch'] },
    ]],

    [cams, [
      { name: 'Black Diamond C4 Cam #2', brand: 'Black Diamond', price: 79, discountPrice: 65,
        sku: nextSku('CAM'), stock: 90,
        description: "Industry-standard spring-loaded camming device with triple-axle design and colour-coded sizing.",
        attributes: { size: '#2', color: 'Blue', material: 'Aluminium Alloy' },
        tags: ['protection', 'cam', 'trad'] },
      { name: 'Wild Country Helium 3 Cam .5', brand: 'Wild Country', price: 89, discountPrice: 74,
        sku: nextSku('CAM'), stock: 75,
        description: "Ultra-lightweight forged cam with rigid stem and twin-axle lobes. 15% lighter than standard.",
        attributes: { size: '.5', color: 'Purple', material: 'Forged Aluminium' },
        tags: ['protection', 'cam', 'lightweight'] },
    ]],

    [nuts, [
      { name: 'Black Diamond Stopper Set (13pc)', brand: 'Black Diamond', price: 69, discountPrice: 58,
        sku: nextSku('NUT'), stock: 100,
        description: "Complete 13-piece stopper set covering sizes 1-13 on steel wire. Essential trad rack foundation.",
        attributes: { size: '1-13', color: 'Silver/Assorted', material: 'Steel Wire' },
        tags: ['protection', 'nuts', 'trad'] },
      { name: 'Wild Country Rocks Set (10pc)', brand: 'Wild Country', price: 59, discountPrice: null,
        sku: nextSku('NUT'), stock: 80,
        description: "Forged aluminium nut set with key sizes 4-13. Includes carabiner-clip racking wire.",
        attributes: { size: '4-13', color: 'Assorted', material: 'Forged Aluminium' },
        tags: ['protection', 'nuts', 'forged'] },
    ]],

    [lockCrab, [
      { name: 'Black Diamond RockLock Screwgate', brand: 'Black Diamond', price: 16, discountPrice: null,
        sku: nextSku('LKC'), stock: 200,
        description: "Full-strength HMS locking carabiner with triple action screwgate and rope-friendly geometry.",
        attributes: { size: 'Standard', color: 'Silver', material: 'Aluminium' },
        tags: ['locking', 'hms', 'screwgate'] },
      { name: 'Petzl William Ball-Lock HMS', brand: 'Petzl', price: 22, discountPrice: null,
        sku: nextSku('LKC'), stock: 180,
        description: "Ball-lock HMS carabiner with intuitive one-hand operation. Ideal for belay and anchor use.",
        attributes: { size: 'Standard', color: 'Blue', material: 'Aluminium' },
        tags: ['locking', 'hms', 'ball-lock'] },
    ]],

    [nonLock, [
      { name: 'Black Diamond Oz Carabiner 6-Pack', brand: 'Black Diamond', price: 54, discountPrice: 45,
        sku: nextSku('NLC'), stock: 150,
        description: "Ultra-light non-locking carabiners in a 6-pack. Straight gate for quickdraws and alpine draws.",
        attributes: { size: 'Pack of 6', color: 'Assorted', material: 'Aluminium' },
        tags: ['non-locking', 'straight-gate', 'lightweight'] },
      { name: 'Mammut Workhorse Keylock 10-Pack', brand: 'Mammut', price: 79, discountPrice: 65,
        sku: nextSku('NLC'), stock: 120,
        description: "Keylock nose non-locking carabiners in a 10-pack. Snag-free clipping on bolts and gear.",
        attributes: { size: 'Pack of 10', color: 'Silver', material: 'Aluminium' },
        tags: ['non-locking', 'keylock', 'value'] },
    ]],

    // ── Bouldering ────────────────────────────────────────────────────────
    [indoorPads, [
      { name: 'Metolius Recon HD Indoor Pad', brand: 'Metolius', price: 159, discountPrice: 134,
        sku: nextSku('ICP'), stock: 30,
        description: "4\" thick dual-foam indoor crash pad with non-slip bottom and fold-flat storage.",
        attributes: { size: '36x48"', color: 'Blue/Black', material: 'Open/Closed Cell Foam' },
        tags: ['indoor', 'crash-pad', 'bouldering'] },
      { name: 'Black Diamond Drop Zone Indoor', brand: 'Black Diamond', price: 179, discountPrice: 149,
        sku: nextSku('ICP'), stock: 25,
        description: "Indoor gym crash pad with adjustable top section and carry straps for easy gym storage.",
        attributes: { size: '40x48"', color: 'Grey/Orange', material: 'Dual Foam' },
        tags: ['indoor', 'crash-pad', 'gym'] },
    ]],

    [outdoorPads, [
      { name: 'Metolius Session II Outdoor Pad', brand: 'Metolius', price: 249, discountPrice: 209,
        sku: nextSku('OCP'), stock: 20,
        description: "36x48\" outdoor trifold crash pad with weather-resistant shell and backpack straps.",
        attributes: { size: '36x48"', color: 'Grey/Orange', material: 'Weather-Resistant Nylon' },
        tags: ['outdoor', 'crash-pad', 'trifold'] },
      { name: 'Black Diamond Mondo Outdoor Pad', brand: 'Black Diamond', price: 329, discountPrice: null,
        sku: nextSku('OCP'), stock: 15,
        description: "XL 50x62\" outdoor pad covering max landing zones for highball bouldering.",
        attributes: { size: '50x62"', color: 'Cobalt', material: 'Abrasion-Resistant Shell' },
        tags: ['outdoor', 'crash-pad', 'xl'] },
    ]],

    [looseChalk, [
      { name: 'Black Diamond White Gold Chalk 300g', brand: 'Black Diamond', price: 19, discountPrice: null,
        sku: nextSku('CHK'), stock: 300,
        description: "Fine-ground 300g loose chalk for maximum friction on holds. Available in resealable bag.",
        attributes: { size: '300g', color: 'White', material: 'Magnesium Carbonate' },
        tags: ['chalk', 'loose', 'fine-grind'] },
      { name: 'Mammut Pure Chalk 150g', brand: 'Mammut', price: 12, discountPrice: null,
        sku: nextSku('CHK'), stock: 250,
        description: "Pure 150g loose chalk with no additives. Provides excellent grip without skin drying.",
        attributes: { size: '150g', color: 'White', material: 'Pure Magnesium Carbonate' },
        tags: ['chalk', 'loose', 'pure'] },
    ]],

    [chalkBag, [
      { name: 'Black Diamond Mojo Chalk Bag', brand: 'Black Diamond', price: 22, discountPrice: 18,
        sku: nextSku('CBG'), stock: 200,
        description: "Round chalk bag with stiff rim, fleece lining, and integrated brush holder for the crag.",
        attributes: { size: 'One Size', color: 'Black', material: 'Nylon/Fleece' },
        tags: ['chalk-bag', 'round', 'fleece'] },
      { name: 'Petzl Woobie Chalk Bag', brand: 'Petzl', price: 28, discountPrice: null,
        sku: nextSku('CBG'), stock: 180,
        description: "Oversized chalk bag with zipped brush pocket and stiff opening for easy one-hand access.",
        attributes: { size: 'One Size', color: 'Teal', material: 'Nylon/Microfibre' },
        tags: ['chalk-bag', 'oversized', 'brush-pocket'] },
    ]],

    // ── Sport Climbing ────────────────────────────────────────────────────
    [assistedBD, [
      { name: 'Petzl Grigri+ Belay Device', brand: 'Petzl', price: 149, discountPrice: 124,
        sku: nextSku('ABD'), stock: 90,
        description: "Assisted-braking belay device with anti-panic handle for sport climbing. Handles 8.5–11mm ropes.",
        attributes: { size: 'Standard', color: 'Black/Yellow', material: 'Aluminium' },
        tags: ['belay', 'assisted-braking', 'anti-panic'] },
      { name: 'Mammut Smart 2.0 Belay Device', brand: 'Mammut', price: 89, discountPrice: 74,
        sku: nextSku('ABD'), stock: 75,
        description: "Smart braking device with magnetic trigger and works with 8.5–10.5mm ropes.",
        attributes: { size: 'Standard', color: 'Black', material: 'Aluminium' },
        tags: ['belay', 'assisted-braking', 'magnetic'] },
    ]],

    [tubeDevs, [
      { name: 'Black Diamond ATC-XP Belay Device', brand: 'Black Diamond', price: 24, discountPrice: null,
        sku: nextSku('TBD'), stock: 200,
        description: "Tube-style device with enhanced friction teeth for rappelling. Handles 7.7–11mm single ropes.",
        attributes: { size: 'Standard', color: 'Silver/Black', material: 'Aluminium' },
        tags: ['belay', 'tube', 'rappel'] },
      { name: 'Edelrid Mega Jul Belay Device', brand: 'Edelrid', price: 49, discountPrice: 39,
        sku: nextSku('TBD'), stock: 160,
        description: "Bi-directional tube device with passive braking. Works as both regular tube and assisted device.",
        attributes: { size: 'Standard', color: 'Oasis', material: 'Aluminium' },
        tags: ['belay', 'tube', 'bi-directional'] },
    ]],

    [sportQD, [
      { name: 'Mammut Dusk Wire Quickdraws 12cm 10pk', brand: 'Mammut', price: 129, discountPrice: 109,
        sku: nextSku('SQD'), stock: 50,
        description: "Lightweight 10-pack sport quickdraws with wire-gate top and bent-gate bottom carabiners.",
        attributes: { size: '12cm', color: 'Red', material: 'Aluminium' },
        tags: ['quickdraw', 'sport', 'wire-gate'] },
      { name: 'Black Diamond HotForge Hybrid Quickdraw 12cm 6pk', brand: 'Black Diamond', price: 99, discountPrice: 84,
        sku: nextSku('SQD'), stock: 60,
        description: "6-pack hotforged quickdraws with keylock noses for snag-free bolt clipping.",
        attributes: { size: '12cm', color: 'Assorted', material: 'Aluminium' },
        tags: ['quickdraw', 'sport', 'keylock'] },
    ]],

    [alpineDraws, [
      { name: 'Black Diamond Positron Quickdraw 17cm 6pk', brand: 'Black Diamond', price: 84, discountPrice: 69,
        sku: nextSku('ALD'), stock: 65,
        description: "Long 17cm alpine draws with double non-locking carabiners for reducing rope drag on meandering routes.",
        attributes: { size: '17cm', color: 'Assorted', material: 'Aluminium' },
        tags: ['alpine-draw', 'trad', 'long'] },
      { name: 'Edelrid Boa Alpine Draw Set 6pk', brand: 'Edelrid', price: 79, discountPrice: null,
        sku: nextSku('ALD'), stock: 50,
        description: "Extendable alpine draws with 60cm sling and two wire-gate carabiners for multi-pitch routing.",
        attributes: { size: '60cm extendable', color: 'Neon Blue', material: 'Dyneema Sling' },
        tags: ['alpine-draw', 'extendable', 'multi-pitch'] },
    ]],

    // ── Alpine Climbing ────────────────────────────────────────────────────
    [iceAxes, [
      { name: 'Black Diamond Raven Ice Axe 65cm', brand: 'Black Diamond', price: 99, discountPrice: 84,
        sku: nextSku('ICA'), stock: 40,
        description: "Classic straight-shafted alpine ice axe with stainless pick and aluminium head. Essential alpine tool.",
        attributes: { size: '65cm', color: 'Black/Orange', material: 'Aluminium/Stainless' },
        tags: ['ice-axe', 'alpine', 'classic'] },
      { name: 'Petzl Sum Tec Ice Axe 60cm', brand: 'Petzl', price: 149, discountPrice: 124,
        sku: nextSku('ICA'), stock: 30,
        description: "Versatile technical ice axe with removable spike for mixed climbing and steep alpine routes.",
        attributes: { size: '60cm', color: 'Black/Yellow', material: 'Aluminium/Chromoly' },
        tags: ['ice-axe', 'technical', 'mixed'] },
    ]],

    [iceHammers, [
      { name: 'Black Diamond Viper Ice Hammer 50cm', brand: 'Black Diamond', price: 189, discountPrice: 159,
        sku: nextSku('ICH'), stock: 25,
        description: "Aggressive ice hammer for dry-tooling and steep ice with curved pick and textured grip.",
        attributes: { size: '50cm', color: 'Black', material: 'Steel/Aluminium' },
        tags: ['ice-hammer', 'dry-tool', 'steep-ice'] },
      { name: 'Petzl Quark Technical Ice Tool 52cm', brand: 'Petzl', price: 229, discountPrice: 199,
        sku: nextSku('ICH'), stock: 20,
        description: "Modular technical tool with interchangeable pick and hammer. For mixed and dry-tooling routes.",
        attributes: { size: '52cm', color: 'Orange/Black', material: 'Steel/Aluminium' },
        tags: ['ice-hammer', 'modular', 'mixed'] },
    ]],

    [stepIn, [
      { name: 'Petzl Vasak Step-In Crampons', brand: 'Petzl', price: 139, discountPrice: 114,
        sku: nextSku('STC'), stock: 35,
        description: "12-point step-in crampons for rigid mountaineering boots. Compatible with C2 sole standard.",
        attributes: { size: 'S/M 35-42 EU', color: 'Silver', material: 'Chromoly Steel' },
        tags: ['crampons', 'step-in', 'mountaineering'] },
      { name: 'Black Diamond Cyborg Pro Step-In', brand: 'Black Diamond', price: 179, discountPrice: 149,
        sku: nextSku('STC'), stock: 28,
        description: "Stainless steel 12-point step-in crampons with modular design for mixed and ice climbing.",
        attributes: { size: 'M/L 40-46 EU', color: 'Silver', material: 'Stainless Steel' },
        tags: ['crampons', 'step-in', 'stainless'] },
    ]],

    [strapCr, [
      { name: 'Petzl Leopard LLF Strap Crampons', brand: 'Petzl', price: 99, discountPrice: 84,
        sku: nextSku('SCC'), stock: 45,
        description: "Lightweight aluminium 10-point strap crampons compatible with all boot types. Winter hiking use.",
        attributes: { size: 'Universal', color: 'Silver', material: 'Aluminium' },
        tags: ['crampons', 'strap', 'lightweight'] },
      { name: 'Mammut Nordwand Strap Crampons', brand: 'Mammut', price: 119, discountPrice: null,
        sku: nextSku('SCC'), stock: 35,
        description: "12-point universal strap crampons with anti-balling plates for snow and ice mountaineering.",
        attributes: { size: 'Universal', color: 'Black/Silver', material: 'Steel' },
        tags: ['crampons', 'strap', 'anti-balling'] },
    ]],

    [lowGait, [
      { name: 'Outdoor Research Flex-Tex Gaiter', brand: 'Black Diamond', price: 29, discountPrice: null,
        sku: nextSku('LGT'), stock: 80,
        description: "Low-profile trail gaiters with stretch neoprene and velcro closure for debris protection.",
        attributes: { size: 'M', color: 'Khaki', material: 'Stretch Neoprene' },
        tags: ['gaiters', 'low', 'trail'] },
      { name: 'Salomon S-Lab Low Gaiter', brand: 'Salomon', price: 35, discountPrice: 28,
        sku: nextSku('LGT'), stock: 70,
        description: "Ultralight low gaiters with hook and loop system for trail running and fast hiking.",
        attributes: { size: 'S/M', color: 'Black', material: 'Stretch Ripstop' },
        tags: ['gaiters', 'low', 'ultralight'] },
    ]],

    [highGait, [
      { name: 'Black Diamond Aspect Gaiter', brand: 'Black Diamond', price: 55, discountPrice: 45,
        sku: nextSku('HGT'), stock: 55,
        description: "High-cut alpine gaiters with GORE-TEX membrane and instep wire for waterproof snow protection.",
        attributes: { size: 'M', color: 'Black', material: 'GORE-TEX' },
        tags: ['gaiters', 'high', 'gore-tex'] },
      { name: 'Mammut Nordwand Gaiter High', brand: 'Mammut', price: 69, discountPrice: 58,
        sku: nextSku('HGT'), stock: 40,
        description: "Heavy-duty high gaiters with full GORE-TEX lining and front YKK zipper for mountaineering.",
        attributes: { size: 'L', color: 'Black', material: 'GORE-TEX 2L' },
        tags: ['gaiters', 'high', 'mountaineering'] },
    ]],

    // ── Safety & Helmets ──────────────────────────────────────────────────
    [foamHelm, [
      { name: 'Petzl Sirocco 2 Helmet', brand: 'Petzl', price: 119, discountPrice: 99,
        sku: nextSku('FHM'), stock: 70,
        description: "Ultra-light 170g EPS foam-only helmet with maximum ventilation for rock and alpine climbing.",
        attributes: { size: 'S/M 48-58cm', color: 'White', material: 'EPS Foam' },
        tags: ['helmet', 'foam', 'lightweight'] },
      { name: 'Black Diamond Vector Helmet', brand: 'Black Diamond', price: 79, discountPrice: 65,
        sku: nextSku('FHM'), stock: 90,
        description: "Hybrid foam and in-mold construction. Lightweight with 15 vents and headlamp clip.",
        attributes: { size: 'M/L 55-63cm', color: 'Matte Black', material: 'EPS/Polycarbonate' },
        tags: ['helmet', 'foam', 'vented'] },
    ]],

    [hybridHelm, [
      { name: 'Mammut Wall Rider MIPS Helmet', brand: 'Mammut', price: 159, discountPrice: 134,
        sku: nextSku('HHM'), stock: 50,
        description: "MIPS-equipped hybrid helmet with 20 vents and adjustable visor. CE EN12492 certified.",
        attributes: { size: 'S-M 52-57cm', color: 'Titanium', material: 'EPS/ABS with MIPS' },
        tags: ['helmet', 'hybrid', 'mips'] },
      { name: 'Petzl Meteor Helmet', brand: 'Petzl', price: 89, discountPrice: 74,
        sku: nextSku('HHM'), stock: 75,
        description: "Hybrid construction helmet with 18 vents and Centerfit adjustment system. 235g.",
        attributes: { size: 'S/M 48-58cm', color: 'Blue', material: 'EPS/ABS Hybrid' },
        tags: ['helmet', 'hybrid', 'adjustable'] },
    ]],

    [belayGlov, [
      { name: 'Black Diamond Crag Gloves', brand: 'Black Diamond', price: 39, discountPrice: null,
        sku: nextSku('BGV'), stock: 100,
        description: "Leather palm belay gloves with articulated pre-curve and velcro wrist closure for rope handling.",
        attributes: { size: 'M', color: 'Black', material: 'Goatskin Leather' },
        tags: ['gloves', 'belay', 'leather'] },
      { name: 'Petzl Belay Gloves', brand: 'Petzl', price: 45, discountPrice: 38,
        sku: nextSku('BGV'), stock: 90,
        description: "Full leather belay gloves with reinforced palm and touchscreen-compatible fingertips.",
        attributes: { size: 'L', color: 'Black/Grey', material: 'Full Grain Leather' },
        tags: ['gloves', 'belay', 'full-leather'] },
    ]],

    [fingerless, [
      { name: 'Black Diamond Crack Gloves', brand: 'Black Diamond', price: 35, discountPrice: 28,
        sku: nextSku('FGV'), stock: 80,
        description: "Fingerless crack climbing gloves with leather palm and knuckle protection for jamming.",
        attributes: { size: 'M', color: 'Black', material: 'Leather/Neoprene' },
        tags: ['gloves', 'fingerless', 'crack-climbing'] },
      { name: 'Metolius 3/4 Finger Crack Gloves', brand: 'Metolius', price: 29, discountPrice: null,
        sku: nextSku('FGV'), stock: 110,
        description: "3/4 finger gloves exposing tips for feel while protecting knuckles on wide crack routes.",
        attributes: { size: 'L', color: 'Tan', material: 'Synthetic Leather' },
        tags: ['gloves', 'fingerless', 'crack'] },
    ]],

    // ── Accessories ───────────────────────────────────────────────────────
    [trailHL, [
      { name: 'Petzl Actik Core 450lm Headlamp', brand: 'Petzl', price: 59, discountPrice: 49,
        sku: nextSku('THL'), stock: 150,
        description: "450-lumen rechargeable headlamp with reactive lighting and red mode. 70-hour burn time.",
        attributes: { size: 'One Size', color: 'Black/Green', material: 'ABS Plastic' },
        tags: ['headlamp', 'rechargeable', 'reactive'] },
      { name: 'Black Diamond Spot 400 Headlamp', brand: 'Black Diamond', price: 39, discountPrice: null,
        sku: nextSku('THL'), stock: 200,
        description: "400-lumen trail headlamp with triple-power modes, red night vision, and IP67 waterproofing.",
        attributes: { size: 'One Size', color: 'Octane', material: 'ABS/Silicone' },
        tags: ['headlamp', 'trail', 'waterproof'] },
    ]],

    [climbHL, [
      { name: 'Petzl Tikka RXP 450lm Headlamp', brand: 'Petzl', price: 89, discountPrice: 74,
        sku: nextSku('CHL'), stock: 100,
        description: "Reactive performance climbing headlamp. Auto-adjusts brightness based on environment. 450 lumens.",
        attributes: { size: 'One Size', color: 'Black', material: 'ABS Plastic' },
        tags: ['headlamp', 'climbing', 'reactive'] },
      { name: 'Black Diamond Storm 500 Headlamp', brand: 'Black Diamond', price: 59, discountPrice: 49,
        sku: nextSku('CHL'), stock: 130,
        description: "500-lumen climbing headlamp with IP67 waterproofing, PowerTap technology, and strobe mode.",
        attributes: { size: 'One Size', color: 'Graphite', material: 'ABS/Silicone' },
        tags: ['headlamp', 'climbing', 'waterproof'] },
    ]],

    [gearSling, [
      { name: 'Black Diamond 18mm Gear Sling', brand: 'Black Diamond', price: 29, discountPrice: null,
        sku: nextSku('GSL'), stock: 180,
        description: "Adjustable 18mm padded gear sling for racking protection, cams, and carabiners on the crag.",
        attributes: { size: '18mm', color: 'Black', material: 'Nylon' },
        tags: ['gear-sling', 'racking', 'padded'] },
      { name: 'Metolius Ultralight Gear Sling', brand: 'Metolius', price: 19, discountPrice: null,
        sku: nextSku('GSL'), stock: 200,
        description: "Low-profile 15mm nylon gear sling with adjustable length for comfort on long trad routes.",
        attributes: { size: '15mm', color: 'Assorted', material: 'Nylon Webbing' },
        tags: ['gear-sling', 'ultralight', 'trad'] },
    ]],

    [ropeBags, [
      { name: 'Black Diamond Rope Bag 30L', brand: 'Black Diamond', price: 49, discountPrice: 39,
        sku: nextSku('RPB'), stock: 90,
        description: "30L tarp-based rope bag with ground tarp and backpack straps for carrying rope to the crag.",
        attributes: { size: '30L', color: 'Dark Curry', material: 'Nylon' },
        tags: ['rope-bag', 'tarp', 'crag'] },
      { name: 'Mammut Rope Bag Compact', brand: 'Mammut', price: 39, discountPrice: null,
        sku: nextSku('RPB'), stock: 110,
        description: "Compact tarpaulin-style rope bag that unfolds as ground tarp. Carries ropes up to 70m.",
        attributes: { size: 'One Size', color: 'Black/Grey', material: 'Tarpaulin Nylon' },
        tags: ['rope-bag', 'compact', 'tarpaulin'] },
    ]],
  ];

  let productCount = 0;
  for (const [catDoc, prods] of productSets) {
    for (const p of prods) {
      await upsertProduct({
        ...p,
        category:    catDoc._id,
        status:      'active',
        visibleWeb:  true,
        visibleApp:  true,
        images:      [`https://picsum.photos/seed/${p.sku.toLowerCase()}/800/800`],
        rating:      parseFloat((3.5 + Math.random() * 1.5).toFixed(1)),
        reviewCount: Math.floor(20 + Math.random() * 300),
        soldCount:   Math.floor(10 + Math.random() * 500),
        alertLevel:  5,
      });
      productCount++;
    }
  }
  console.log(`✔  ${productCount} products seeded`);

  console.log('\n🎉 Climbing seed complete!');
  await mongoose.disconnect();
};

seed().catch(err => { console.error(err); process.exit(1); });
