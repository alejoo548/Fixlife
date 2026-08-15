import { API_URL } from '../config/api';

const API_PUBLIC_URL = API_URL.replace(/\/+$/, '');

export const normalizeImageUrl = (value?: string | null): string => {
  const raw = (value || '').trim();
  if (!raw) return '';

  // Backend bakes an absolute origin (from the request's Host header) into
  // asset URLs. That origin can differ from what the browser can actually
  // reach (LAN IP, docker service name, tunnel domain), so re-anchor any
  // /uploads/ (or protected /api/uploads/) path to the frontend's own
  // resolved API origin instead of trusting the backend's host.
  const uploadsMatch = raw.match(/^https?:\/\/[^/]+(\/(?:api\/)?uploads\/.*)$/i);
  if (uploadsMatch) {
    return `${API_PUBLIC_URL}${uploadsMatch[1]}`;
  }

  if (raw.startsWith('/uploads/') || raw.startsWith('/api/uploads/')) {
    return `${API_PUBLIC_URL}${raw}`;
  }

  if (/^[^/:?#]+\.(png|jpe?g|webp|avif|svg)$/i.test(raw)) {
    return `${API_PUBLIC_URL}/uploads/public/${encodeURIComponent(raw)}`;
  }

  return raw;
};

export const isExternalStockImage = (value?: string | null): boolean => {
  const raw = (value || '').trim();
  return /images\.unsplash\.com|randomuser\.me/i.test(raw);
};
