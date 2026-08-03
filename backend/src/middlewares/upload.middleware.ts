import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { recognize } from 'tesseract.js';
import type { NextFunction, Request, Response } from 'express';
import { protectedUploadsDir, publicUploadsDir, ensureUploadDirectories } from '../utils/assets';
import { sanitizeImageInPlace, ImageSanitizeError } from '../utils/imageSanitizer';
import { moderateUploadedContent } from '../utils/contentModeration';
import {
  ensureUploadModerationTables,
  moderateImageWithAi,
  recordUploadModerationReview,
} from '../services/uploadModeration.service';
import { recordAccountIncident } from '../services/accountEnforcement.service';

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
const CONTENT_MODERATION_ENABLED = process.env.CONTENT_MODERATION_ENABLED !== 'false';
const CONTENT_MODERATION_SYNC_OCR = process.env.CONTENT_MODERATION_SYNC_OCR !== 'false';
const AI_IMAGE_MODERATION_STRICT_REVIEW = process.env.AI_IMAGE_MODERATION_STRICT_REVIEW !== 'false';
const AI_IMAGE_MODERATION_FAIL_CLOSED = process.env.AI_IMAGE_MODERATION_FAIL_CLOSED === 'true';
const UPLOAD_MODERATION_DEBUG = process.env.UPLOAD_MODERATION_DEBUG === 'true';
const AI_IMAGE_MODERATION_REQUIRED_FIELDS = new Set(
  String(process.env.AI_IMAGE_MODERATION_REQUIRED_FIELDS || 'chat_images')
    .split(',')
    .map((fieldName) => fieldName.trim())
    .filter(Boolean)
);
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

const cleanupOtherUploadedFiles = async (
  files: Express.Multer.File[],
  preservedFile: Express.Multer.File
) => {
  await cleanupUploadedFiles(files.filter((file) => file.path !== preservedFile.path));
};

const getRequestUserId = (req: Request) => {
  const user = (req as Request & { user?: { user_id?: number } }).user;
  const userId = Number(user?.user_id || 0);
  return Number.isFinite(userId) && userId > 0 ? userId : null;
};

const getRequestIdFromParams = (req: Request) => {
  const idRequest = Number((req.params || {}).idRequest || 0);
  return Number.isFinite(idRequest) && idRequest > 0 ? idRequest : null;
};

const getRequestUserRole = (req: Request) => {
  const role = String((req as Request & { user?: { rol?: string } }).user?.rol || 'client');
  return role === 'worker' ? 'worker' : 'client';
};

const logUploadModerationDebug = (stage: string, payload: Record<string, unknown>) => {
  if (!UPLOAD_MODERATION_DEBUG) return;
  console.info(`[upload-moderation:${stage}]`, JSON.stringify(payload, null, 2));
};

const recordUploadIncident = async (
  req: Request,
  input: { reviewId?: number | null; decision: 'review' | 'block'; reason?: string | null; requestId?: number | null }
) => {
  const userId = getRequestUserId(req);
  if (!userId) return;
  await recordAccountIncident({
    userId,
    actorRole: getRequestUserRole(req),
    incidentType: input.decision === 'block' ? 'blocked_upload' : 'suspicious_upload',
    severity: input.decision === 'block' ? 'high' : 'medium',
    sourceType: 'upload_moderation_review',
    sourceId: input.reviewId ?? null,
    requestId: input.requestId ?? null,
    description: input.reason || (input.decision === 'block' ? 'Upload blocked by content policy.' : 'Upload sent to moderation review.'),
    penaltyReason: 'inappropriate_content',
  }).catch((error) => console.error('recordUploadIncident error:', error));
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
    await ensureUploadModerationTables();
    for (const file of files) {
      const header = await fs.readFile(file.path);
      const originalExtension = path.extname(file.originalname).toLowerCase();

      if (file.mimetype === 'application/pdf') {
        const moderation = CONTENT_MODERATION_ENABLED
          ? moderateUploadedContent({
              originalFilename: file.originalname,
              fieldName: file.fieldname,
            })
          : { allowed: true, riskType: 'clean' as const, reason: null, matches: [] };

        if (!moderation.allowed) {
          await recordUploadModerationReview({
            userId: getRequestUserId(req),
            requestId: getRequestIdFromParams(req),
            uploadField: file.fieldname,
            fileName: file.filename || path.basename(file.path),
            originalFileName: file.originalname,
            result: {
              decision: 'block',
              provider: 'local',
              model: null,
              reason: moderation.reason,
              categories: { adult_content: true },
              categoryScores: { adult_content: 1 },
              flagged: true,
            },
          }).catch(() => undefined);
          await cleanupOtherUploadedFiles(files, file);
          res.status(400).json({
            error: 'This upload violates Fixlife content policy. Upload only service-related files.',
            code: 'CONTENT_POLICY_VIOLATION',
          });
          return;
        }

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
      const shouldRunSyncOcr =
        CONTENT_MODERATION_ENABLED &&
        CONTENT_MODERATION_SYNC_OCR &&
        OCR_SUPPORTED_FORMATS.has(format) &&
        header.length <= OCR_MAX_BYTES;
      const ocr = shouldRunSyncOcr
        ? await extractOcrText(file.path, format, header.length)
        : {
            pending: OCR_SUPPORTED_FORMATS.has(format) && header.length <= OCR_MAX_BYTES,
            skipped: !OCR_SUPPORTED_FORMATS.has(format) || header.length > OCR_MAX_BYTES,
            reason: !OCR_SUPPORTED_FORMATS.has(format)
              ? 'OCR is only enabled for JPG, PNG and WEBP images.'
              : header.length > OCR_MAX_BYTES
                ? `Image is larger than OCR limit (${OCR_MAX_BYTES} bytes).`
                : null,
            text: '',
            confidence: null,
          };
      const moderation = CONTENT_MODERATION_ENABLED
        ? moderateUploadedContent({
            originalFilename: file.originalname,
            fieldName: file.fieldname,
            ocrText: ocr.text,
          })
        : { allowed: true, riskType: 'clean', reason: null, matches: [] };
      logUploadModerationDebug('local', {
        file: file.originalname,
        field: file.fieldname,
        userId: getRequestUserId(req),
        requestId: getRequestIdFromParams(req),
        allowed: moderation.allowed,
        riskType: moderation.riskType,
        reason: moderation.reason,
        matches: moderation.matches,
        ocrTextLength: String(ocr.text || '').length,
      });

      if (!moderation.allowed) {
        const requestId = getRequestIdFromParams(req);
        const reviewId = await recordUploadModerationReview({
          userId: getRequestUserId(req),
          requestId,
          uploadField: file.fieldname,
          fileName: file.filename || path.basename(file.path),
          originalFileName: file.originalname,
          result: {
            decision: 'block',
            provider: 'local',
            model: null,
            reason: moderation.reason,
            categories: { adult_content: true },
            categoryScores: { adult_content: 1 },
            flagged: true,
          },
        }).catch(() => undefined);
        await recordUploadIncident(req, { reviewId, decision: 'block', reason: moderation.reason, requestId });
        await cleanupOtherUploadedFiles(files, file);
        res.status(400).json({
          error: 'This upload violates Fixlife content policy. Upload only service-related images.',
          code: 'CONTENT_POLICY_VIOLATION',
        });
        return;
      }

      const aiModeration = await moderateImageWithAi({
        filePath: file.path,
        mimeType: file.mimetype,
      });
      const requestId = getRequestIdFromParams(req);
      logUploadModerationDebug('openai', {
        file: file.originalname,
        field: file.fieldname,
        userId: getRequestUserId(req),
        requestId,
        provider: aiModeration.provider,
        model: aiModeration.model,
        decision: aiModeration.decision,
        flagged: aiModeration.flagged,
        reason: aiModeration.reason,
        categories: aiModeration.categories,
        categoryScores: aiModeration.categoryScores,
        skippedReason: aiModeration.skippedReason,
        strictReview: AI_IMAGE_MODERATION_STRICT_REVIEW,
        failClosed: AI_IMAGE_MODERATION_FAIL_CLOSED,
        strictField: AI_IMAGE_MODERATION_REQUIRED_FIELDS.has(file.fieldname),
      });
      const aiReviewId = await recordUploadModerationReview({
        userId: getRequestUserId(req),
        requestId,
        uploadField: file.fieldname,
        fileName: file.filename || path.basename(file.path),
        originalFileName: file.originalname,
        result: aiModeration,
      });
      const requiresStrictVisualModeration = AI_IMAGE_MODERATION_REQUIRED_FIELDS.has(file.fieldname);
      const shouldBlockForAiReview =
        aiModeration.decision === 'review' &&
        AI_IMAGE_MODERATION_STRICT_REVIEW &&
        requiresStrictVisualModeration &&
        aiModeration.flagged;

      if (aiModeration.decision === 'block' || shouldBlockForAiReview) {
        await recordUploadIncident(req, {
          reviewId: aiReviewId,
          decision: aiModeration.decision === 'block' ? 'block' : 'review',
          reason: aiModeration.reason,
          requestId,
        });
      }

      if (requiresStrictVisualModeration && aiModeration.decision === 'skipped') {
        await cleanupOtherUploadedFiles(files, file);
        res.status(400).json({
          error: 'We could not verify this image safely. Please try again in a moment.',
          code: 'AI_CONTENT_MODERATION_REQUIRED',
        });
        return;
      }

      if (
        aiModeration.decision === 'block' ||
        shouldBlockForAiReview
      ) {
        await cleanupOtherUploadedFiles(files, file);
        res.status(400).json({
          error: aiModeration.decision === 'block'
            ? 'This image violates Fixlife content policy. Upload only service-related images.'
            : 'This image needs moderation review before it can be used.',
          code: aiModeration.decision === 'block'
            ? 'AI_CONTENT_POLICY_VIOLATION'
            : 'AI_CONTENT_REVIEW_REQUIRED',
        });
        return;
      }

      await writeImageMetadataSidecar(file, {
        sha256: contentHash,
        detected_format: format,
        declared_mime_type: file.mimetype,
        byte_size: header.length,
        exif_orientation: orientation,
        ocr,
        moderation: {
          enabled: CONTENT_MODERATION_ENABLED,
          status: moderation.allowed ? 'approved' : 'blocked',
          risk_type: moderation.riskType,
          matches: moderation.matches,
          checked_at: new Date().toISOString(),
        },
        ai_moderation: {
          provider: aiModeration.provider,
          model: aiModeration.model,
          decision: aiModeration.decision,
          flagged: aiModeration.flagged,
          reason: aiModeration.reason,
          checked_at: new Date().toISOString(),
        },
      });
      if (!shouldRunSyncOcr) {
        queueOcrMetadataUpdate(file.path, format, header.length);
      }

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
      }).ocrText = ocr.text;
      (file as Express.Multer.File & {
        detectedFormat?: string;
        exifOrientation?: number | null;
        contentHash?: string;
        ocrText?: string;
        ocrConfidence?: number | null;
      }).ocrConfidence = ocr.confidence;
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
