require('dotenv').config();
const mongoose  = require('mongoose');
const connectDB = require('./config/db');
const Category  = require('./models/Category');

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const upsert = (data) =>
  Category.findOneAndUpdate({ slug: data.slug }, data, { upsert: true, new: true });

const seed = async () => {
  await connectDB();
  console.log('🌱 Seeding BookStore category tree...\n');

  // ── Level 0: Root categories ──────────────────────────────────────────────
  const roots = [
    { name: 'Fiction',            icon: '📖', sortOrder: 0 },
    { name: 'Non Fiction',        icon: '📚', sortOrder: 1 },
    { name: 'Children Books',     icon: '🧒', sortOrder: 2 },
    { name: 'Must Have Books',    icon: '⭐', sortOrder: 3 },
    { name: 'Educational Books',  icon: '🎓', sortOrder: 4 },
    { name: 'Bengali Books',      icon: '🇧🇩', sortOrder: 5 },
    { name: 'Most Popular',       icon: '🔥', sortOrder: 6 },
    { name: 'Comic Books',        icon: '💥', sortOrder: 7 },
    { name: 'Others Books',       icon: '📦', sortOrder: 8 },
  ];

  const R = {};
  for (const r of roots) {
    R[r.name] = await upsert({ name: r.name, slug: slug(r.name), icon: r.icon, depth: 0, sortOrder: r.sortOrder, isActive: true });
  }
  console.log(`✔  ${roots.length} root categories`);

  // ── Helper ────────────────────────────────────────────────────────────────
  const sub = async (rootName, name, order = 0) => {
    const parent = R[rootName];
    return upsert({ name, slug: slug(name), icon: '📁', depth: 1, parent: parent._id, sortOrder: order, isActive: true });
  };

  // ── FICTION ───────────────────────────────────────────────────────────────
  await sub('Fiction', 'Literature & Fiction',          0);
  await sub('Fiction', 'Mystery, Thriller & Suspense',  1);
  await sub('Fiction', 'Romance',                        2);
  await sub('Fiction', 'Science Fiction & Fantasy',      3);
  await sub('Fiction', 'Teen & Young Adult',             4);

  console.log('✔  Fiction subtree done');

  // ── NON FICTION ───────────────────────────────────────────────────────────
  await sub('Non Fiction', 'Biographies & Memoirs',        0);
  await sub('Non Fiction', 'Business & Money',             1);
  await sub('Non Fiction', 'Computers & Technology',       2);
  await sub('Non Fiction', 'Recipe, Food',                 3);
  await sub('Non Fiction', 'Crafts, Hobbies & Home',       4);
  await sub('Non Fiction', 'Engineering & Transportation', 5);
  await sub('Non Fiction', 'Health, Fitness & Dieting',    6);
  await sub('Non Fiction', 'History',                      7);
  await sub('Non Fiction', 'Law',                          8);
  await sub('Non Fiction', 'Medical Books',                9);
  await sub('Non Fiction', 'Parenting & Relationships',    10);
  await sub('Non Fiction', 'Politics & Social Sciences',   11);
  await sub('Non Fiction', 'Religion & Spirituality',      12);
  await sub('Non Fiction', 'Science & Math',               13);
  await sub('Non Fiction', 'Self-help',                    14);
  await sub('Non Fiction', 'Sports & Outdoors',            15);
  await sub('Non Fiction', 'Travel',                       16);
  await sub('Non Fiction', 'Articles & Others',            17);
  await sub('Non Fiction', 'Bengali Stories',              18);
  await sub('Non Fiction', 'Exam Preparation',             19);
  await sub('Non Fiction', 'Upannayas',                    20);
  await sub('Non Fiction', 'Gardening',                    21);
  await sub('Non Fiction', 'Rachanabali',                  22);
  await sub('Non Fiction', 'School Books',                 23);

  console.log('✔  Non Fiction subtree done');

  // ── CHILDREN BOOKS ────────────────────────────────────────────────────────
  await sub('Children Books', "All Children's Books", 0);
  await sub('Children Books', "Editors' Picks",        1);
  await sub('Children Books', "Teacher's Picks",       2);
  await sub('Children Books', 'Award Winners',         3);

  console.log('✔  Children Books subtree done');

  const total = await Category.countDocuments();
  console.log(`\n🎉 Done! Total categories in DB: ${total}`);
  await mongoose.disconnect();
};

seed().catch(err => { console.error(err); process.exit(1); });
