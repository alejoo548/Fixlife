import { API_URL } from '../config/api';

const API_PUBLIC_URL = API_URL.replace(/\/+$/, '');

export const normalizeImageUrl = (value?: string | null): string => {
  const raw = (value || '').trim();
  if (!raw) return '';

  if (/^https?:\/\/(localhost|127\.0\.0\.1):8000\/uploads\//i.test(raw)) {
    return raw;
  }

  if (raw.startsWith('/uploads/')) {
    return `${API_PUBLIC_URL}${raw}`;
  }

  if (/^[^/:?#]+\.(png|jpe?g|webp|avif|svg)$/i.test(raw)) {
    return `${API_PUBLIC_URL}/uploads/${encodeURIComponent(raw)}`;
  }

  return raw;
};

export const isExternalStockImage = (value?: string | null): boolean => {
  const raw = (value || '').trim();
  return /images\.unsplash\.com|randomuser\.me/i.test(raw);
};
