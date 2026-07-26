import React, { useEffect, useMemo, useState } from 'react';
import { showSweetToast } from '../utils/sweetAlert';
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
      void showSweetToast({ tone: 'error', message: validationError });
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      void showSweetToast({ tone: 'error', message: 'Session expired. Please sign in again.' });
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
      void showSweetToast({ tone: 'success', message: 'Profile updated successfully. Redirecting to home...' });
      window.setTimeout(() => onBack(), 700);
    } catch (error: any) {
      void showSweetToast({ tone: 'error', message: getErrorMessage(error, 'Error updating profile.') });
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
      void showSweetToast({ tone: 'error', message: 'Only JPG, PNG, WEBP or AVIF images are allowed.' });
      e.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      void showSweetToast({ tone: 'error', message: 'Image size must be 5MB or less.' });
      e.target.value = '';
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      void showSweetToast({ tone: 'error', message: 'Session expired. Please sign in again.' });
      return;
    }

    setIsUploading(true);
    try {
      const { data } = await uploadProfileImage(file, token);
      updateUser({ ...user, profile_image: data.profile_image });
      void showSweetToast({ tone: 'success', message: 'Profile image updated successfully.' });
    } catch (error: any) {
      void showSweetToast({ tone: 'error', message: getErrorMessage(error, 'Error uploading image.') });
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleRemovePhoto = async () => {
    if (!user?.profile_image) return;

    const token = localStorage.getItem('token');
    if (!token) {
      void showSweetToast({ tone: 'error', message: 'Session expired. Please sign in again.' });
      return;
    }

    setIsRemovingPhoto(true);
    try {
      await removeProfileImage(token);
      updateUser({ ...user, profile_image: null });
      void showSweetToast({ tone: 'success', message: 'Profile image removed successfully.' });
    } catch (error: any) {
      void showSweetToast({ tone: 'error', message: getErrorMessage(error, 'Error removing image.') });
    } finally {
      setIsRemovingPhoto(false);
    }
  };

  return (
    <div className="relative z-10 pt-28 lg:pt-36 px-4 lg:px-8 max-w-4xl mx-auto pb-24 w-full">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-bird-blue/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative overflow-hidden bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl border border-slate-200/80 dark:border-white/10 rounded-[2.5rem] shadow-2xl p-6 sm:p-10">
        
        {/* Top Back Navigation Button */}
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200/60 dark:border-white/10 text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 transition-all mb-8 group"
        >
          <svg className="w-4 h-4 group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Home
        </button>

        {/* Profile Banner Header */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-slate-950 to-indigo-950 p-6 sm:p-8 text-white mb-8 shadow-xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-bird-blue/20 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative z-10 flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
            {/* Avatar block with camera upload overlay */}
            <div className="relative group shrink-0">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl p-1 bg-gradient-to-tr from-bird-blue via-sky-400 to-indigo-500 shadow-[0_10px_30px_rgba(0,144,255,0.3)]">
                {profileImageUrl ? (
                  <img
                    src={profileImageUrl}
                    alt="Profile"
                    className="w-full h-full rounded-[14px] object-cover border-2 border-white dark:border-slate-900"
                  />
                ) : (
                  <div className="w-full h-full rounded-[14px] bg-slate-900 text-white flex items-center justify-center text-3xl font-black border-2 border-white/20">
                    {initials || 'U'}
                  </div>
                )}
              </div>

              {/* Upload badge overlay button */}
              <label className="absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center rounded-xl bg-bird-blue text-white shadow-lg cursor-pointer hover:scale-110 active:scale-95 transition-all">
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.avif,image/jpeg,image/png,image/webp,image/avif"
                  onChange={handleImageUpload}
                  className="hidden"
                  disabled={isUploading || isRemovingPhoto}
                />
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </label>
            </div>

            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-black uppercase tracking-wider mb-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Verified Client Account
              </div>
              <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white truncate">{fullName || 'User Profile'}</h1>
              <p className="text-slate-300 text-xs sm:text-sm font-semibold mt-1 truncate">{user?.email}</p>
            </div>

            {/* Photo Action Buttons */}
            <div className="flex flex-wrap sm:flex-col gap-2 shrink-0">
              <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-bird-blue hover:bg-bird-darkBlue text-white font-black text-xs cursor-pointer shadow-md transition-all active:scale-95">
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.avif,image/jpeg,image/png,image/webp,image/avif"
                  onChange={handleImageUpload}
                  className="hidden"
                  disabled={isUploading || isRemovingPhoto}
                />
                {isUploading ? 'Uploading...' : 'Change Photo'}
              </label>

              {user?.profile_image && (
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  disabled={isUploading || isRemovingPhoto}
                  className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-rose-500/20 text-rose-300 border border-white/10 font-black text-xs transition-all active:scale-95 disabled:opacity-50"
                >
                  {isRemovingPhoto ? 'Removing...' : 'Remove Photo'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Profile Details Form */}
        <form onSubmit={handleSaveProfile} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            
            {/* Name Input */}
            <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-slate-800/50 p-4 transition-all focus-within:border-bird-blue focus-within:ring-2 focus-within:ring-bird-blue/20">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-400">First Name</label>
                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                maxLength={60}
                autoComplete="given-name"
                className="w-full bg-transparent text-base font-bold text-slate-950 dark:text-slate-100 outline-none"
              />
            </div>

            {/* Lastname Input */}
            <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-slate-800/50 p-4 transition-all focus-within:border-bird-blue focus-within:ring-2 focus-within:ring-bird-blue/20">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-400">Last Name</label>
                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <input
                type="text"
                name="lastname"
                value={formData.lastname}
                onChange={handleInputChange}
                maxLength={60}
                autoComplete="family-name"
                className="w-full bg-transparent text-base font-bold text-slate-950 dark:text-slate-100 outline-none"
              />
            </div>

            {/* Phone Input */}
            <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-slate-800/50 p-4 transition-all focus-within:border-bird-blue focus-within:ring-2 focus-within:ring-bird-blue/20">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-400">Phone Number</label>
                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <input
                type="tel"
                name="phone_number"
                value={formData.phone_number}
                onChange={handleInputChange}
                inputMode="numeric"
                maxLength={16}
                autoComplete="tel"
                placeholder="+503 7000 0000"
                className="w-full bg-transparent text-base font-bold text-slate-950 dark:text-slate-100 placeholder-slate-400 outline-none"
              />
            </div>

            {/* Username Input */}
            <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-slate-800/50 p-4 transition-all focus-within:border-bird-blue focus-within:ring-2 focus-within:ring-bird-blue/20">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-400">Username</label>
                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleInputChange}
                maxLength={30}
                autoComplete="username"
                placeholder="@username"
                className="w-full bg-transparent text-base font-bold text-slate-950 dark:text-slate-100 placeholder-slate-400 outline-none"
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100 dark:border-white/10">
            <button
              type="submit"
              disabled={isSaving || isUploading || isRemovingPhoto}
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-bird-blue hover:bg-bird-darkBlue text-white font-black text-sm tracking-wide shadow-lg shadow-bird-blue/30 transition-all active:scale-95 disabled:opacity-50"
            >
              {isSaving ? 'Saving Changes...' : 'Save Changes'}
            </button>

            <button
              type="button"
              onClick={logout}
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-bold text-sm border border-rose-200 dark:border-rose-900/50 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors"
            >
              Log Out Account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserProfile;
