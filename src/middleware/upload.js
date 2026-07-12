const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const { v4: uuidv4 } = require('uuid');

const ensureDir = (dir) => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); };

const storage = (folder) => multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(__dirname, '../../', process.env.UPLOAD_DIR || 'uploads', folder);
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

const imageFilter = (_req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'];
  if (allowed.includes(path.extname(file.originalname).toLowerCase())) return cb(null, true);
  cb(new Error('Only image files are allowed'), false);
};

const maxSize = () => (parseInt(process.env.MAX_FILE_SIZE_MB) || 5) * 1024 * 1024;

const uploadProductImages = multer({ storage: storage('products'), fileFilter: imageFilter, limits: { fileSize: maxSize() } }).array('images', 10);
const uploadCategoryImage = multer({ storage: storage('categories'), fileFilter: imageFilter, limits: { fileSize: maxSize() } }).single('image');
const uploadLogo          = multer({ storage: storage('branding'), fileFilter: imageFilter, limits: { fileSize: maxSize() } }).single('logo');
const uploadFavicon       = multer({ storage: storage('branding'), fileFilter: imageFilter, limits: { fileSize: maxSize() } }).single('favicon');
const uploadAvatar        = multer({ storage: storage('avatars'), fileFilter: imageFilter, limits: { fileSize: maxSize() } }).single('avatar');
const uploadReviewImages  = multer({ storage: storage('reviews'), fileFilter: imageFilter, limits: { fileSize: maxSize() } }).array('images', 5);
const uploadBanner        = multer({ storage: storage('banners'), fileFilter: imageFilter, limits: { fileSize: maxSize() } }).single('banner');
const uploadBrandLogo     = multer({ storage: storage('brands'), fileFilter: imageFilter, limits: { fileSize: maxSize() } }).single('logo');
const uploadAppIcon       = multer({ storage: storage('branding'), fileFilter: imageFilter, limits: { fileSize: maxSize() } }).single('appIcon');
const uploadBlogCover     = multer({ storage: storage('blogs'),    fileFilter: imageFilter, limits: { fileSize: maxSize() } }).single('coverImage');

module.exports = {
  uploadProductImages,
  uploadCategoryImage,
  uploadLogo,
  uploadFavicon,
  uploadAvatar,
  uploadReviewImages,
  uploadBanner,
  uploadBrandLogo,
  uploadAppIcon,
  uploadBlogCover,
};
