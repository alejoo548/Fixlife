import React, { useEffect, useMemo, useState } from 'react';
import { Notyf } from 'notyf';
import 'notyf/notyf.min.css';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config/api';
import { removeProfileImage, updateProfile, uploadProfileImage } from '../services/authService';

interface UserProfileProps {
  onBack: () => void;
}

const NAME_REGEX = /^[\p{L}]+(?:[\p{L} .'-]*[\p{L}])?$/u;
const PHONE_REGEX = /^\+?[0-9]{8,15}$/;
const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,30}$/;

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif'
]);

const ALLOWED_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif']);

const sanitizeNameInput = (value: string): string => {
  return value.replace(/[^\p{L} .'-]/gu, '').slice(0, 60);
};

const sanitizePhoneInput = (value: string): string => {
  const normalized = value.replace(/[^\d+]/g, '');
  const noExtraPlus = normalized.startsWith('+')
    ? `+${normalized.slice(1).replace(/\+/g, '')}`
    : normalized.replace(/\+/g, '');
  return noExtraPlus.slice(0, 16);
};

const sanitizeUsernameInput = (value: string): string => {
  return value.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 30);
};

const normalizeStoredUsername = (username: unknown, email: unknown): string => {
  const value = String(username ?? '').trim();
  const currentEmail = String(email ?? '').trim().toLowerCase();

  if (!value) return '';
  if (value.toLowerCase() === currentEmail) return '';
  return USERNAME_REGEX.test(value) ? value : '';
};

const UserProfile: React.FC<UserProfileProps> = ({ onBack }) => {
  const { user, logout, updateUser } = useAuth();
  const notyf = useMemo(
    () =>
      new Notyf({
        position: { x: 'left', y: 'bottom' },
        duration: 3200,
        ripple: true,
      }),
    []
  );

  const [formData, setFormData] = useState({
    name: '',
    lastname: '',
    phone_number: '',
    username: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isRemovingPhoto, setIsRemovingPhoto] = useState(false);

  useEffect(() => {
    setFormData({
      name: user?.name || '',
      lastname: user?.lastname || '',
      phone_number: user?.phone_number || '',
      username: normalizeStoredUsername(user?.username, user?.email)
    });
  }, [user]);

  const fullName = [user?.name, user?.lastname].filter(Boolean).join(' ');
  const initials = fullName
    .split(' ')
    .filter(Boolean)
    .map((part: string) => part[0]?.toUpperCase())
    .join('')
    .slice(0, 2);

  const profileImageUrl = useMemo(() => {
    const raw = user?.profile_image;
    if (!raw) return '';
    const rawString = String(raw);
    if (rawString.startsWith('http://') || rawString.startsWith('https://')) {
      return rawString;
    }
    const apiPublicUrl = API_URL.replace(/\/api\/?$/, '');
    const cleanPath = rawString.replace(/^\/+/, '');
    if (cleanPath.startsWith('uploads/')) {
      return `${apiPublicUrl}/${cleanPath}`;
    }
    return `${apiPublicUrl}/uploads/${cleanPath}`;
  }, [user?.profile_image]);

  const getErrorMessage = (error: any, fallback: string) =>
    error?.response?.data?.error || error?.message || fallback;

  const validateProfileForm = (): string | null => {
    const name = formData.name.trim();
    const lastname = formData.lastname.trim();
    const phone = formData.phone_number.trim();
    const username = formData.username.trim();

    if (!name || !lastname) return 'Name and lastname are required.';
    if (name.length < 2 || name.length > 60 || !NAME_REGEX.test(name)) return 'Invalid name format.';
    if (lastname.length < 2 || lastname.length > 60 || !NAME_REGEX.test(lastname)) return 'Invalid lastname format.';
    if (phone && !PHONE_REGEX.test(phone)) return 'Invalid phone format. Use 8 to 15 digits.';
    if (username && !USERNAME_REGEX.test(username)) return 'Invalid username format. Use 3-30 letters, numbers, . _ or -.';

    return null;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    if (name === 'name' || name === 'lastname') {
      setFormData((prev) => ({ ...prev, [name]: sanitizeNameInput(value) }));
      return;
    }

    if (name === 'phone_number') {
      setFormData((prev) => ({ ...prev, phone_number: sanitizePhoneInput(value) }));
      return;
    }

    if (name === 'username') {
      setFormData((prev) => ({ ...prev, username: sanitizeUsernameInput(value) }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const validationError = validateProfileForm();
    if (validationError) {
      notyf.error(validationError);
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      notyf.error('Session expired. Please sign in again.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        lastname: formData.lastname.trim(),
        phone_number: formData.phone_number.trim(),
        username: formData.username.trim()
      };

      const { data } = await updateProfile(payload, token);
      updateUser({ ...user, ...data.user });
      notyf.success('Profile updated successfully. Redirecting to home...');
      window.setTimeout(() => onBack(), 700);
    } catch (error: any) {
      notyf.error(getErrorMessage(error, 'Error updating profile.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    const hasValidFormat = ALLOWED_IMAGE_TYPES.has(file.type) && ALLOWED_IMAGE_EXTENSIONS.has(extension);

    if (!hasValidFormat) {
      notyf.error('Only JPG, PNG, WEBP or AVIF images are allowed.');
      e.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      notyf.error('Image size must be 5MB or less.');
      e.target.value = '';
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      notyf.error('Session expired. Please sign in again.');
      return;
    }

    setIsUploading(true);
    try {
      const { data } = await uploadProfileImage(file, token);
      updateUser({ ...user, profile_image: data.profile_image });
      notyf.success('Profile image updated successfully.');
    } catch (error: any) {
      notyf.error(getErrorMessage(error, 'Error uploading image.'));
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleRemovePhoto = async () => {
    if (!user?.profile_image) return;

    const token = localStorage.getItem('token');
    if (!token) {
      notyf.error('Session expired. Please sign in again.');
      return;
    }

    setIsRemovingPhoto(true);
    try {
      await removeProfileImage(token);
      updateUser({ ...user, profile_image: null });
      notyf.success('Profile image removed successfully.');
    } catch (error: any) {
      notyf.error(getErrorMessage(error, 'Error removing image.'));
    } finally {
      setIsRemovingPhoto(false);
    }
  };

  return (
    <div className="relative z-10 pt-28 lg:pt-36 px-4 lg:px-8 max-w-4xl mx-auto pb-24 w-full">
      <div className="bg-white/85 backdrop-blur-xl border border-gray-200/60 rounded-3xl shadow-xl p-6 md:p-10">
        <button
          onClick={onBack}
          className="text-sm font-semibold text-gray-600 hover:text-bird-blue transition-colors mb-6"
        >
          Back to home
        </button>

        <div className="flex flex-col md:flex-row md:items-center gap-6 mb-8">
          {profileImageUrl ? (
            <img
              src={profileImageUrl}
              alt="Profile"
              className="w-20 h-20 rounded-2xl object-cover border border-gray-200 shadow-lg shadow-bird-blue/20"
            />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-bird-blue text-white flex items-center justify-center text-2xl font-black shadow-lg shadow-bird-blue/30">
              {initials || 'U'}
            </div>
          )}

          <div>
            <h1 className="text-3xl font-black text-gray-900">{fullName || 'User profile'}</h1>
            <p className="text-gray-600 font-medium mt-1">Update your personal information and profile photo.</p>
          </div>
        </div>

        <div className="mb-8 rounded-2xl border border-gray-200 bg-gray-50/70 p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-3">Profile photo</p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-3 px-4 py-2 rounded-xl bg-bird-blue text-white font-bold cursor-pointer hover:bg-bird-darkBlue transition-colors">
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.avif,image/jpeg,image/png,image/webp,image/avif"
                onChange={handleImageUpload}
                className="hidden"
                disabled={isUploading || isRemovingPhoto}
              />
              {isUploading ? 'Uploading...' : 'Change photo'}
            </label>

            <button
              type="button"
              onClick={handleRemovePhoto}
              disabled={!user?.profile_image || isUploading || isRemovingPhoto}
              className="px-4 py-2 rounded-xl border border-red-200 text-red-600 font-bold hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRemovingPhoto ? 'Removing...' : 'Remove photo'}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">Allowed: JPG, PNG, WEBP, AVIF. Max 5MB.</p>
        </div>

        <form onSubmit={handleSaveProfile} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4 block">
            <p className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-2">Name</p>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              maxLength={60}
              autoComplete="given-name"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-gray-900 font-semibold outline-none focus:ring-2 focus:ring-bird-blue/40"
            />
          </label>

          <label className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4 block">
            <p className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-2">Lastname</p>
            <input
              type="text"
              name="lastname"
              value={formData.lastname}
              onChange={handleInputChange}
              maxLength={60}
              autoComplete="family-name"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-gray-900 font-semibold outline-none focus:ring-2 focus:ring-bird-blue/40"
            />
          </label>

          <label className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4 block">
            <p className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-2">Phone</p>
            <input
              type="tel"
              name="phone_number"
              value={formData.phone_number}
              onChange={handleInputChange}
              inputMode="numeric"
              maxLength={16}
              autoComplete="tel"
              placeholder="Optional"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-gray-900 font-semibold outline-none focus:ring-2 focus:ring-bird-blue/40"
            />
          </label>

          <label className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4 block">
            <p className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-2">Username</p>
            <input
              type="text"
              name="username"
              value={formData.username}
              onChange={handleInputChange}
              maxLength={30}
              autoComplete="username"
              placeholder="Optional"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-gray-900 font-semibold outline-none focus:ring-2 focus:ring-bird-blue/40"
            />
          </label>

          <div className="md:col-span-2 mt-2 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={isSaving || isUploading || isRemovingPhoto}
              className="px-5 py-3 rounded-xl bg-bird-blue text-white font-bold hover:bg-bird-darkBlue transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving...' : 'Save changes'}
            </button>

            <button
              type="button"
              onClick={logout}
              className="px-5 py-3 rounded-xl bg-red-50 text-red-600 font-bold border border-red-200 hover:bg-red-100 transition-colors"
            >
              Log Out
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserProfile;
