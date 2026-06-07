import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const ALLOWED_INPUT_FORMATS = new Set(['jpeg', 'jpg', 'png', 'webp', 'avif']);
const MAX_DIMENSION = 6000;
const MAX_PIXELS = 24_000_000;
const MAX_INPUT_BYTES = 5 * 1024 * 1024;
const WEBP_QUALITY = 82;

export class ImageSanitizeError extends Error {}

/**
 * Decodes an uploaded image to raw pixels, validates it is a real raster image,
 * then re-encodes it to WebP. Re-encoding discards every non-pixel byte
 * (EXIF / ICC / XMP metadata, trailing payloads, polyglot/script content),
 * neutralising tampering done at the mime/extension/magic-byte level.
 * Replaces the file on disk and returns the new filename.
 */
export async function sanitizeImageInPlace(file: Express.Multer.File): Promise<string> {
  const sourcePath = file.path;

  const stat = await fs.promises.stat(sourcePath);
  if (stat.size === 0 || stat.size > MAX_INPUT_BYTES) {
    throw new ImageSanitizeError('Image size is not allowed.');
  }

  const buffer = await fs.promises.readFile(sourcePath);

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(buffer, { limitInputPixels: MAX_PIXELS }).metadata();
  } catch {
    throw new ImageSanitizeError('File is not a valid image.');
  }

  const format = (metadata.format || '').toLowerCase();
  if (!ALLOWED_INPUT_FORMATS.has(format)) {
    throw new ImageSanitizeError('Unsupported image format.');
  }

  const width = metadata.width || 0;
  const height = metadata.height || 0;
  if (width <= 0 || height <= 0 || width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw new ImageSanitizeError('Image dimensions are not allowed.');
  }
  if (width * height > MAX_PIXELS) {
    throw new ImageSanitizeError('Image resolution is too large.');
  }
  if ((metadata.pages || 1) > 1) {
    throw new ImageSanitizeError('Animated images are not allowed.');
  }

  let output: Buffer;
  try {
    output = await sharp(buffer, { limitInputPixels: MAX_PIXELS, animated: false })
      .rotate()
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch {
    throw new ImageSanitizeError('Image could not be processed.');
  }

  const dir = path.dirname(sourcePath);
  const base = path.basename(file.filename, path.extname(file.filename));
  const newFilename = `${base}.webp`;
  const newPath = path.join(dir, newFilename);

  await fs.promises.writeFile(newPath, output);
  if (newPath !== sourcePath) {
    await fs.promises.unlink(sourcePath).catch(() => undefined);
  }

  file.filename = newFilename;
  file.path = newPath;
  file.mimetype = 'image/webp';
  return newFilename;
}
