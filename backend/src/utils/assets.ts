import { Request } from 'express';

const getPublicHost = (req: Request) => {
  const host = req.get('host') || '127.0.0.1:8000';
  return host.toLowerCase() === 'localhost:8000' ? '127.0.0.1:8000' : host;
};

export const publicUploadUrl = (req: Request, value: string | null | undefined) => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  if (/^https?:\/\/localhost:8000\/uploads\//i.test(raw)) {
    return raw.replace(/^https?:\/\/localhost:8000/i, 'http://127.0.0.1:8000');
  }

  if (/^https?:\/\//i.test(raw)) return raw;

  const fileName = raw.replace(/^\/?uploads\//i, '');
  return `${req.protocol}://${getPublicHost(req)}/uploads/${encodeURIComponent(fileName)}`;
};
