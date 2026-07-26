import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Request } from 'express';
import { getJwtSecret } from '../config/security';

export const uploadsRoot = path.resolve(process.cwd(), 'uploads');
export const publicUploadsDir = path.join(uploadsRoot, 'public');
export const protectedUploadsDir = path.join(uploadsRoot, 'protected');
const PROTECTED_ASSET_TTL_MS = 10 * 60 * 1000;
const configuredPublicApiOrigin = String(process.env.PUBLIC_API_ORIGIN || process.env.API_PUBLIC_ORIGIN || '')
  .trim()
  .replace(/\/+$/, '');

export const ensureUploadDirectories = () => {
  for (const dir of [uploadsRoot, publicUploadsDir, protectedUploadsDir]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
};

ensureUploadDirectories();

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);

export const cleanStoredFileName = (fileName: string | null | undefined) => {
  if (!fileName) return null;
  return path.basename(String(fileName).replace(/\\/g, '/'));
};

export const isImageFileName = (fileName: string | null | undefined) => {
  const cleanName = cleanStoredFileName(fileName);
  return !!cleanName && IMAGE_EXTENSIONS.has(path.extname(cleanName).toLowerCase());
};

// Asset URLs must reflect whichever origin the current request actually came
// in on (localhost:8000 for local dev, the tunnel's public domain when
// accessed through cloudflared) so images work on both without one breaking
// the other. PUBLIC_API_ORIGIN is only a last-resort fallback for the rare
// case the Host header itself is missing/malformed — it must never override
// a valid request host, or every asset URL gets pinned to whatever domain
// happened to be configured at the time (e.g. a since-rotated tunnel URL),
// breaking image loading on every other origin.
const buildOrigin = (req: Request) => {
  const host = String(req.get('host') || '').trim();
  if (!/^[a-zA-Z0-9.-]+(?::\d{1,5})?$/.test(host)) {
    return configuredPublicApiOrigin || 'http://127.0.0.1:8000';
  }

  const normalizedHost = host.toLowerCase() === 'localhost:8000' ? '127.0.0.1:8000' : host;
  return `${req.protocol}://${normalizedHost}`;
};

export const buildPublicAssetUrl = (req: Request, fileName: string | null | undefined) => {
  if (!fileName) return null;
  const raw = String(fileName);
  if (/^https?:\/\//i.test(raw)) return raw;
  const cleanName = cleanStoredFileName(raw);
  if (!cleanName) return null;
  return `${buildOrigin(req)}/uploads/public/${encodeURIComponent(cleanName)}`;
};

export const buildProtectedAssetUrl = (req: Request, fileName: string | null | undefined) => {
  const cleanName = cleanStoredFileName(fileName);
  if (!cleanName) return null;
  const expires = Date.now() + PROTECTED_ASSET_TTL_MS;
  const signature = signProtectedAsset(cleanName, expires);
  return `${buildOrigin(req)}/api/uploads/protected/${encodeURIComponent(cleanName)}?expires=${expires}&signature=${signature}`;
};

const signProtectedAsset = (fileName: string, expires: number) =>
  crypto
    .createHmac('sha256', getJwtSecret())
    .update(`${fileName}.${expires}`)
    .digest('base64url');

export const hasValidProtectedAssetSignature = (
  fileName: string,
  expiresRaw: unknown,
  signatureRaw: unknown
) => {
  const expires = Number(expiresRaw);
  const signature = String(signatureRaw || '');
  if (!Number.isFinite(expires) || expires < Date.now() || !signature) return false;
  const expected = signProtectedAsset(fileName, expires);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
};

const resolveFrom = (dir: string, fileName: string | null | undefined) => {
  const cleanName = cleanStoredFileName(fileName);
  if (!cleanName) return null;
  const resolved = path.resolve(dir, cleanName);
  if (!resolved.startsWith(path.resolve(dir) + path.sep)) return null;
  return fs.existsSync(resolved) ? resolved : null;
};

export const resolvePublicUploadPath = (fileName: string | null | undefined) => {
  if (!isImageFileName(fileName)) return null;
  return resolveFrom(publicUploadsDir, fileName);
};

export const resolveProtectedUploadPath = (fileName: string | null | undefined) =>
  resolveFrom(protectedUploadsDir, fileName) || resolveFrom(uploadsRoot, fileName);

export const deleteUploadIfExists = (
  fileName: string | null | undefined,
  visibility: 'public' | 'protected' | 'any' = 'any'
) => {
  const candidates =
    visibility === 'public'
      ? [publicUploadsDir, uploadsRoot]
      : visibility === 'protected'
        ? [protectedUploadsDir, uploadsRoot]
        : [publicUploadsDir, protectedUploadsDir, uploadsRoot];

  for (const dir of candidates) {
    const filePath = resolveFrom(dir, fileName);
    if (!filePath) continue;
    try {
      fs.unlinkSync(filePath);
      const metadataPath = `${filePath}.metadata.json`;
      if (fs.existsSync(metadataPath)) {
        fs.unlinkSync(metadataPath);
      }
    } catch {
      // Best-effort cleanup only.
    }
  }
};
