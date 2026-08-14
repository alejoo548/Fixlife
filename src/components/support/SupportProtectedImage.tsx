import React, { useEffect, useState } from 'react';
import { API_URL } from '../../config/api';
import { getToken } from '../../utils/session';
import { normalizeImageUrl } from '../../utils/imageUrls';

interface SupportProtectedImageProps {
  imageUrl: string;
  token?: string | null;
  className?: string;
}

const resolveProtectedImageUrl = (value: string) => {
  const raw = value.trim();
  if (raw.startsWith('blob:') || raw.startsWith('data:')) {
    return raw;
  }
  if (/^https?:\/\//i.test(raw)) {
    return normalizeImageUrl(raw);
  }

  const cleanName = raw.replace(/^\/+/, '').replace(/^api\/uploads\/protected\//, '');
  return `${API_URL}/api/uploads/protected/${encodeURIComponent(cleanName)}`;
};

export const SupportProtectedImage: React.FC<SupportProtectedImageProps> = ({
  imageUrl,
  token,
  className = '',
}) => {
  const [objectUrl, setObjectUrl] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let nextObjectUrl = '';

    const load = async () => {
      setError(false);
      setObjectUrl('');

      const url = resolveProtectedImageUrl(imageUrl);
      if (/^(blob:|data:)/i.test(url)) {
        setObjectUrl(url);
        return;
      }

      try {
        const authToken = token || getToken('admin') || getToken();
        const res = await fetch(url, {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
        });
        if (!res.ok) throw new Error('Image fetch failed');
        const blob = await res.blob();
        nextObjectUrl = URL.createObjectURL(blob);
        if (!cancelled) setObjectUrl(nextObjectUrl);
      } catch {
        if (!cancelled) setError(true);
      }
    };

    load();

    return () => {
      cancelled = true;
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
    };
  }, [imageUrl, token]);

  if (error) {
    return (
      <div className="rounded-xl border border-dashed border-current/20 px-3 py-2 text-xs opacity-70">
        Image unavailable
      </div>
    );
  }

  if (!objectUrl) {
    return (
      <div className="h-28 w-44 animate-pulse rounded-xl bg-current/10" />
    );
  }

  return (
    <img
      src={objectUrl}
      alt="Support attachment"
      className={`max-h-64 max-w-full rounded-xl object-cover ${className}`}
    />
  );
};
