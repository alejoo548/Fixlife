import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { recognize } from 'tesseract.js';
import type { NextFunction, Request, Response } from 'express';
import { protectedUploadsDir, publicUploadsDir, ensureUploadDirectories } from '../utils/assets';
import { sanitizeImageInPlace, ImageSanitizeError } from '../utils/imageSanitizer';

ensureUploadDirectories();

const createStorage = (destinationDir: string) => multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, destinationDir);
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
  'image/avif'
]);

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const PDF_EXTENSIONS = new Set(['.pdf']);
const FORMAT_EXTENSIONS: Record<string, string> = {
  jpeg: '.jpg',
  png: '.png',
  webp: '.webp',
  avif: '.avif',
};
const FORMAT_ALLOWED_EXTENSIONS: Record<string, Set<string>> = {
  jpeg: new Set(['.jpg', '.jpeg']),
  png: new Set(['.png']),
  webp: new Set(['.webp']),
  avif: new Set(['.avif']),
};
const FORMAT_MIME_TYPES: Record<string, Set<string>> = {
  jpeg: new Set(['image/jpeg']),
  png: new Set(['image/png']),
  webp: new Set(['image/webp']),
  avif: new Set(['image/avif']),
};
const OCR_ENABLED = process.env.OCR_ENABLED !== 'false';
const OCR_SUPPORTED_FORMATS = new Set(['jpeg', 'png', 'webp']);
const OCR_MAX_BYTES = Number(process.env.IMAGE_OCR_MAX_BYTES || 4 * 1024 * 1024);
const OCR_TEXT_MAX_LENGTH = Number(process.env.IMAGE_OCR_TEXT_MAX_LENGTH || 4000);
const OCR_LANGUAGES = String(process.env.IMAGE_OCR_LANGUAGES || 'eng+spa');
const MB = 1024 * 1024;
const uploadLimits = {
  fileSize: 10 * MB,
  files: 8,
  fields: 30,
  parts: 40,
  fieldNameSize: 80,
  fieldSize: 20 * 1024,
};
const imageUploadLimits = {
  ...uploadLimits,
  fileSize: 5 * MB,
  files: 10,
};

const hasValidImageFormat = (file: Express.Multer.File): boolean => {
  const extension = path.extname(file.originalname).toLowerCase();
  return IMAGE_MIME_TYPES.has(file.mimetype) && IMAGE_EXTENSIONS.has(extension);
};

const hasValidPdfFormat = (file: Express.Multer.File): boolean => {
  const extension = path.extname(file.originalname).toLowerCase();
  return file.mimetype === 'application/pdf' && PDF_EXTENSIONS.has(extension);
};

const docsAndImageFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (hasValidPdfFormat(file) || hasValidImageFormat(file)) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported format. Upload a valid JPG, PNG, WEBP, AVIF image or PDF file.'));
  }
};

const imageOnlyFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (hasValidImageFormat(file)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG, PNG, WEBP or AVIF images are allowed. GIF is not supported.'));
  }
};

const isJpeg = (buffer: Buffer) =>
  buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

const isPng = (buffer: Buffer) =>
  buffer.length >= 8 &&
  buffer[0] === 0x89 &&
  buffer[1] === 0x50 &&
  buffer[2] === 0x4e &&
  buffer[3] === 0x47 &&
  buffer[4] === 0x0d &&
  buffer[5] === 0x0a &&
  buffer[6] === 0x1a &&
  buffer[7] === 0x0a;

const isWebp = (buffer: Buffer) =>
  buffer.length >= 12 &&
  buffer.toString('ascii', 0, 4) === 'RIFF' &&
  buffer.toString('ascii', 8, 12) === 'WEBP';

const isAvif = (buffer: Buffer) => {
  if (buffer.length < 16 || buffer.toString('ascii', 4, 8) !== 'ftyp') return false;
  const brand = buffer.toString('ascii', 8, 12);
  return brand === 'avif' || brand === 'avis';
};

const isPdf = (buffer: Buffer) =>
  buffer.length >= 5 && buffer.toString('ascii', 0, 5) === '%PDF-';

const hasTrailingJpegData = (buffer: Buffer) => {
  if (!isJpeg(buffer)) return false;
  const eoi = buffer.lastIndexOf(Buffer.from([0xff, 0xd9]));
  return eoi < 0 || buffer.slice(eoi + 2).some((byte) => byte !== 0);
};

const hasTrailingPngData = (buffer: Buffer) => {
  if (!isPng(buffer)) return false;
  const iend = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44]);
  const iendIndex = buffer.lastIndexOf(iend);
  if (iendIndex < 0) return true;
  const endOffset = iendIndex + 12;
  return endOffset !== buffer.length;
};

const hasTrailingWebpData = (buffer: Buffer) => {
  if (!isWebp(buffer) || buffer.length < 12) return false;
  const riffSize = buffer.readUInt32LE(4);
  const expectedSize = riffSize + 8 + (riffSize % 2);
  return expectedSize !== buffer.length;
};

const hasTrailingAvifData = (buffer: Buffer) => {
  if (!isAvif(buffer) || buffer.length < 4) return false;
  const declaredSize = buffer.readUInt32BE(0);
  return declaredSize > 0 && declaredSize !== buffer.length;
};

const hasTrailingPayload = (buffer: Buffer, format: string) => {
  if (format === 'jpeg') return hasTrailingJpegData(buffer);
  if (format === 'png') return hasTrailingPngData(buffer);
  if (format === 'webp') return hasTrailingWebpData(buffer);
  if (format === 'avif') return hasTrailingAvifData(buffer);
  return true;
};

const readExifOrientation = (buffer: Buffer): number | null => {
  if (!isJpeg(buffer)) return null;

  let offset = 2;
  while (offset + 4 < buffer.length) {
    if (buffer[offset] !== 0xff) return null;

    const marker = buffer[offset + 1];
    const size = buffer.readUInt16BE(offset + 2);
    if (marker === 0xe1 && buffer.toString('ascii', offset + 4, offset + 10) === 'Exif\0\0') {
      const tiffStart = offset + 10;
      const littleEndian = buffer.toString('ascii', tiffStart, tiffStart + 2) === 'II';
      const readUInt16 = (pos: number) => littleEndian ? buffer.readUInt16LE(pos) : buffer.readUInt16BE(pos);
      const readUInt32 = (pos: number) => littleEndian ? buffer.readUInt32LE(pos) : buffer.readUInt32BE(pos);
      const ifdOffset = readUInt32(tiffStart + 4);
      const ifdStart = tiffStart + ifdOffset;
      if (ifdStart + 2 > buffer.length) return null;

      const entries = readUInt16(ifdStart);
      for (let index = 0; index < entries; index += 1) {
        const entryOffset = ifdStart + 2 + index * 12;
        if (entryOffset + 12 > buffer.length) return null;
        const tag = readUInt16(entryOffset);
        if (tag === 0x0112) {
          return readUInt16(entryOffset + 8);
        }
      }

      return null;
    }

    if (size < 2) return null;
    offset += 2 + size;
  }

  return null;
};

const detectImageFormat = (buffer: Buffer) => {
  if (isJpeg(buffer)) return 'jpeg';
  if (isPng(buffer)) return 'png';
  if (isWebp(buffer)) return 'webp';
  if (isAvif(buffer)) return 'avif';
  return null;
};

const flattenUploadedFiles = (req: Request) => {
  const files: Express.Multer.File[] = [];
  if (req.file) files.push(req.file);
  if (Array.isArray(req.files)) files.push(...req.files);
  if (req.files && !Array.isArray(req.files)) {
    Object.values(req.files).forEach((group) => files.push(...group));
  }
  return files;
};

const cleanupUploadedFiles = async (files: Express.Multer.File[]) => {
  await Promise.all(
    files
      .filter((file) => Boolean(file.path))
      .map((file) => fs.unlink(file.path).catch(() => undefined))
  );
};

const safeUploadPrefix = (fieldName: string) => fieldName.replace(/[^a-zA-Z0-9_-]/g, '') || 'upload';

const moveToContentAddressedFile = async (
  file: Express.Multer.File,
  buffer: Buffer,
  format: string
) => {
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const extension = FORMAT_EXTENSIONS[format];
  const nextFilename = `${safeUploadPrefix(file.fieldname)}-${hash}${extension}`;
  const nextPath = path.join(path.dirname(file.path), nextFilename);

  if (path.resolve(file.path) !== path.resolve(nextPath)) {
    try {
      await fs.access(nextPath);
      await fs.unlink(file.path).catch(() => undefined);
    } catch {
      await fs.rename(file.path, nextPath);
    }
  }

  file.filename = nextFilename;
  file.path = nextPath;

  return hash;
};

const extractOcrText = async (filePath: string, format: string, size: number) => {
  if (!OCR_ENABLED) {
    return { skipped: true, reason: 'OCR disabled via OCR_ENABLED=false.', text: '', confidence: null };
  }
  if (!OCR_SUPPORTED_FORMATS.has(format)) {
    return {
      skipped: true,
      reason: 'OCR is only enabled for JPG, PNG and WEBP images.',
      text: '',
      confidence: null,
    };
  }

  if (size > OCR_MAX_BYTES) {
    return {
      skipped: true,
      reason: `Image is larger than OCR limit (${OCR_MAX_BYTES} bytes).`,
      text: '',
      confidence: null,
    };
  }

  try {
    const result = await recognize(filePath, OCR_LANGUAGES);
    const rawText = String(result?.data?.text || '').trim();
    return {
      skipped: false,
      reason: null,
      text: rawText.slice(0, OCR_TEXT_MAX_LENGTH),
      confidence: typeof result?.data?.confidence === 'number' ? result.data.confidence : null,
    };
  } catch (error: any) {
    return {
      skipped: true,
      reason: String(error?.message || 'OCR failed.'),
      text: '',
      confidence: null,
    };
  }
};

const writeImageMetadataSidecar = async (
  file: Express.Multer.File,
  req: Request,
  metadata: Record<string, unknown>
) => {
  await fs.writeFile(
    `${file.path}.metadata.json`,
    JSON.stringify(
      {
        ...metadata,
        stored_filename: file.filename,
        original_filename: path.basename(file.originalname || ''),
        uploaded_field: file.fieldname,
        uploader_user_id: (req as Request & { user?: { user_id?: number } }).user?.user_id ?? null,
        uploader_ip: req.ip || req.socket.remoteAddress || null,
        forwarded_for: req.headers['x-forwarded-for'] || null,
        inspected_at: new Date().toISOString(),
      },
      null,
      2
    ),
    'utf8'
  );
};

let ocrQueue: Promise<void> = Promise.resolve();

const queueOcrMetadataUpdate = (
  filePath: string,
  format: string,
  size: number
) => {
  setTimeout(() => {
    ocrQueue = ocrQueue
      .then(async () => {
        const ocr = await extractOcrText(filePath, format, size);
        const sidecarPath = `${filePath}.metadata.json`;
        const current = JSON.parse(await fs.readFile(sidecarPath, 'utf8')) as Record<string, unknown>;
        await fs.writeFile(
          sidecarPath,
          JSON.stringify(
            {
              ...current,
              ocr,
              ocr_completed_at: new Date().toISOString(),
            },
            null,
            2
          ),
          'utf8'
        );
      })
      .catch((error) => {
        console.error('[image-ocr] Background OCR failed:', error);
      });
  }, 500);
};

export const validateUploadedFiles = async (req: Request, res: Response, next: NextFunction) => {
  const files = flattenUploadedFiles(req);

  try {
    for (const file of files) {
      const header = await fs.readFile(file.path);
      const originalExtension = path.extname(file.originalname).toLowerCase();

      if (file.mimetype === 'application/pdf') {
        if (!PDF_EXTENSIONS.has(originalExtension) || !isPdf(header)) {
          await cleanupUploadedFiles(files);
          res.status(400).json({ error: 'Invalid PDF file. Upload a real .pdf document.' });
          return;
        }
        continue;
      }

      const format = detectImageFormat(header);
      const orientation = readExifOrientation(header);

      if (!format) {
        await cleanupUploadedFiles(files);
        res.status(400).json({ error: 'Invalid image file. Upload a real JPG, PNG, WEBP or AVIF image.' });
        return;
      }

      if (!FORMAT_MIME_TYPES[format]?.has(file.mimetype)) {
        await cleanupUploadedFiles(files);
        res.status(400).json({ error: 'Image content does not match the declared file type.' });
        return;
      }

      if (!FORMAT_ALLOWED_EXTENSIONS[format]?.has(originalExtension)) {
        await cleanupUploadedFiles(files);
        res.status(400).json({ error: 'Image extension does not match the uploaded image content.' });
        return;
      }

      if (hasTrailingPayload(header, format)) {
        await cleanupUploadedFiles(files);
        res.status(400).json({ error: 'Image contains unexpected trailing data.' });
        return;
      }

      if (orientation != null && (orientation < 1 || orientation > 8)) {
        await cleanupUploadedFiles(files);
        res.status(400).json({ error: 'Invalid image orientation metadata.' });
        return;
      }

      const contentHash = await moveToContentAddressedFile(file, header, format);
      await writeImageMetadataSidecar(file, req, {
        sha256: contentHash,
        detected_format: format,
        declared_mime_type: file.mimetype,
        byte_size: header.length,
        exif_orientation: orientation,
        ocr: {
          pending: OCR_SUPPORTED_FORMATS.has(format) && header.length <= OCR_MAX_BYTES,
          skipped: !OCR_SUPPORTED_FORMATS.has(format) || header.length > OCR_MAX_BYTES,
          reason: !OCR_SUPPORTED_FORMATS.has(format)
            ? 'OCR is only enabled for JPG, PNG and WEBP images.'
            : header.length > OCR_MAX_BYTES
              ? `Image is larger than OCR limit (${OCR_MAX_BYTES} bytes).`
              : null,
          text: '',
          confidence: null,
        },
      });
      queueOcrMetadataUpdate(file.path, format, header.length);

      (file as Express.Multer.File & {
        detectedFormat?: string;
        exifOrientation?: number | null;
        contentHash?: string;
        ocrText?: string;
        ocrConfidence?: number | null;
      }).detectedFormat = format;
      (file as Express.Multer.File & {
        detectedFormat?: string;
        exifOrientation?: number | null;
        contentHash?: string;
        ocrText?: string;
        ocrConfidence?: number | null;
      }).exifOrientation = orientation;
      (file as Express.Multer.File & {
        detectedFormat?: string;
        exifOrientation?: number | null;
        contentHash?: string;
        ocrText?: string;
        ocrConfidence?: number | null;
      }).contentHash = contentHash;
      (file as Express.Multer.File & {
        detectedFormat?: string;
        exifOrientation?: number | null;
        contentHash?: string;
        ocrText?: string;
        ocrConfidence?: number | null;
      }).ocrText = '';
      (file as Express.Multer.File & {
        detectedFormat?: string;
        exifOrientation?: number | null;
        contentHash?: string;
        ocrText?: string;
        ocrConfidence?: number | null;
      }).ocrConfidence = null;
    }

    next();
  } catch {
    await cleanupUploadedFiles(files);
    res.status(400).json({ error: 'Could not verify uploaded image metadata.' });
  }
};

export const sanitizeImages = async (req: Request, res: Response, next: NextFunction) => {
  const files = flattenUploadedFiles(req);
  const imageFiles = files.filter((f) => f.mimetype !== 'application/pdf');

  try {
    for (const file of imageFiles) {
      await sanitizeImageInPlace(file);
    }
    next();
  } catch (err) {
    await cleanupUploadedFiles(files);
    if (err instanceof ImageSanitizeError) {
      res.status(400).json({ error: err.message });
    } else {
      res.status(400).json({ error: 'Image failed security sanitization.' });
    }
  }
};

export const upload = multer({
  storage: createStorage(protectedUploadsDir),
  fileFilter: docsAndImageFilter,
  limits: uploadLimits
});

export const uploadImageOnly = multer({
  storage: createStorage(publicUploadsDir),
  fileFilter: imageOnlyFilter,
  limits: imageUploadLimits
});

export const uploadProtectedImageOnly = multer({
  storage: createStorage(protectedUploadsDir),
  fileFilter: imageOnlyFilter,
  limits: imageUploadLimits
});
