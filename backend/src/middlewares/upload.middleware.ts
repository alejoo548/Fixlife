import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Ensure uploads folder exists
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const safeFieldName = file.fieldname.replace(/[^a-zA-Z0-9_-]/g, '') || 'upload';
    cb(null, safeFieldName + '-' + uniqueSuffix + path.extname(file.originalname).toLowerCase());
  }
});

const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif'
]);

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

const hasValidImageFormat = (file: Express.Multer.File): boolean => {
  const extension = path.extname(file.originalname).toLowerCase();
  return IMAGE_MIME_TYPES.has(file.mimetype) && IMAGE_EXTENSIONS.has(extension);
};

const docsAndImageFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.mimetype === 'application/pdf' || hasValidImageFormat(file)) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported format. Upload a valid image or a PDF.'));
  }
};

const imageOnlyFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (hasValidImageFormat(file)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG, PNG, WEBP, GIF or AVIF images are allowed.'));
  }
};

export const upload = multer({
  storage,
  fileFilter: docsAndImageFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
});

export const uploadImageOnly = multer({
  storage,
  fileFilter: imageOnlyFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});
