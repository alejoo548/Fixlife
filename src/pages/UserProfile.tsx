import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { showSweetToast } from '../utils/sweetAlert';
import { useAuth } from '../context/AuthContext';
import { removeProfileImage, updateProfile, uploadProfileImage } from '../services/authService';
import { normalizeImageUrl } from '../utils/imageUrls';

interface UserProfileProps {
  onBack: () => void;
}

const NAME_REGEX = /^[\p{L}]+(?:[\p{L}\s]*[\p{L}])?$/u;
const PHONE_REGEX = /^\d{4}-\d{4}$/;
const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,30}$/;

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif'
]);

const ALLOWED_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif']);

const sanitizeNameInput = (value: string): string => {
  return value.replace(/[^\p{L}\s]/gu, '').slice(0, 16);
};

const normalizeNameCase = (value: string): string =>
  sanitizeNameInput(value)
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('es')
    .replace(/(^|\s)(\p{L})/gu, (_match, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase('es')}`);

const sanitizePhoneInput = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return digits.length > 4 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : digits;
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

const getNextUsernameChangeDate = (changedAt: unknown): Date | null => {
  if (!changedAt) return null;
  const parsed = new Date(String(changedAt));
  if (Number.isNaN(parsed.getTime())) return null;
  const next = new Date(parsed.getTime() + 30 * 24 * 60 * 60 * 1000);
  return next.getTime() > Date.now() ? next : null;
};

const UserProfile: React.FC<UserProfileProps> = ({ onBack }) => {
  const { t } = useTranslation();
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
      name: normalizeNameCase(user?.name || ''),
      lastname: normalizeNameCase(user?.lastname || ''),
      phone_number: sanitizePhoneInput(user?.phone_number || ''),
      username: normalizeStoredUsername(user?.username, user?.email)
    });
  }, [user]);

  const fullName = [formData.name, formData.lastname].filter(Boolean).join(' ');
  const initials = fullName
    .split(' ')
    .filter(Boolean)
    .map((part: string) => part[0]?.toUpperCase())
    .join('')
    .slice(0, 2);

  const profileImageUrl = useMemo(() => normalizeImageUrl(user?.profile_image), [user?.profile_image]);
  const [profileImgBroken, setProfileImgBroken] = useState(false);
  useEffect(() => {
    setProfileImgBroken(false);
  }, [profileImageUrl]);

  const nextUsernameChangeDate = getNextUsernameChangeDate(user?.username_changed_at);
  const isUsernameLocked = Boolean(nextUsernameChangeDate);

  const getErrorMessage = (error: any, fallback: string) =>
    error?.response?.data?.error || error?.message || fallback;

  const validateProfileForm = (): string | null => {
    const name = normalizeNameCase(formData.name);
    const lastname = normalizeNameCase(formData.lastname);
    const phone = formData.phone_number.trim();
    const username = formData.username.trim();

    if (!name || !lastname || !phone) return t('userProfile.validation.required');
    if (name.length < 2 || name.length > 16 || !NAME_REGEX.test(name)) return 'El nombre debe tener de 2 a 16 caracteres y solo letras.';
    if (lastname.length < 2 || lastname.length > 16 || !NAME_REGEX.test(lastname)) return 'El apellido debe tener de 2 a 16 caracteres y solo letras.';
    if (!PHONE_REGEX.test(phone)) return 'El telefono debe contener exactamente 8 digitos, como 6074-6649.';
    if (username && !USERNAME_REGEX.test(username)) return t('userProfile.validation.invalidUsername');

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
      if (isUsernameLocked) return;
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
      void showSweetToast({ tone: 'error', message: t('userProfile.messages.sessionExpired') });
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name: normalizeNameCase(formData.name),
        lastname: normalizeNameCase(formData.lastname),
        phone_number: formData.phone_number.trim(),
        username: formData.username.trim()
      };

      const { data } = await updateProfile(payload, token);
      updateUser({ ...user, ...data.user });
      void showSweetToast({ tone: 'success', message: t('userProfile.messages.updateSuccess') });
      window.setTimeout(() => onBack(), 700);
    } catch (error: any) {
      void showSweetToast({ tone: 'error', message: getErrorMessage(error, t('userProfile.messages.updateError')) });
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
      void showSweetToast({ tone: 'error', message: t('userProfile.messages.invalidImage') });
      e.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      void showSweetToast({ tone: 'error', message: t('userProfile.messages.invalidImageSize') });
      e.target.value = '';
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      void showSweetToast({ tone: 'error', message: t('userProfile.messages.sessionExpired') });
      return;
    }

    setIsUploading(true);
    try {
      const { data } = await uploadProfileImage(file, token);
      updateUser({ ...user, profile_image: data.profile_image });
      void showSweetToast({ tone: 'success', message: t('userProfile.messages.imageUploadSuccess') });
    } catch (error: any) {
      void showSweetToast({ tone: 'error', message: getErrorMessage(error, t('userProfile.messages.imageUploadError')) });
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleRemovePhoto = async () => {
    if (!user?.profile_image) return;

    const token = localStorage.getItem('token');
    if (!token) {
      void showSweetToast({ tone: 'error', message: t('userProfile.messages.sessionExpired') });
      return;
    }

    setIsRemovingPhoto(true);
    try {
      await removeProfileImage(token);
      updateUser({ ...user, profile_image: null });
      void showSweetToast({ tone: 'success', message: t('userProfile.messages.imageRemoveSuccess') });
    } catch (error: any) {
      void showSweetToast({ tone: 'error', message: getErrorMessage(error, t('userProfile.messages.imageRemoveError')) });
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
          {t('userProfile.back')}
        </button>

        {/* Profile Banner Header */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-slate-950 to-indigo-950 p-6 sm:p-8 text-white mb-8 shadow-xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-bird-blue/20 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative z-10 flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
            {/* Avatar block with camera upload overlay */}
            <div className="relative group shrink-0">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl p-1 bg-gradient-to-tr from-bird-blue via-sky-400 to-indigo-500 shadow-[0_10px_30px_rgba(0,144,255,0.3)]">
                {profileImageUrl && !profileImgBroken ? (
                  <img
                    src={profileImageUrl}
                    alt={t('userProfile.photoTitle')}
                    onError={() => setProfileImgBroken(true)}
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
                {t('userProfile.verifiedBadge')}
              </div>
              <h1 className="max-w-full text-2xl sm:text-4xl font-black tracking-tight text-white truncate">{fullName || t('userProfile.titleFallback')}</h1>
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
                {isUploading ? t('userProfile.uploading') : t('userProfile.upload')}
              </label>

              {user?.profile_image && (
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  disabled={isUploading || isRemovingPhoto}
                  className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-rose-500/20 text-rose-300 border border-white/10 font-black text-xs transition-all active:scale-95 disabled:opacity-50"
                >
                  {isRemovingPhoto ? t('userProfile.removing') : t('userProfile.remove')}
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
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-400">{t('userProfile.fields.name')}</label>
                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                maxLength={16}
                autoComplete="given-name"
                className="w-full min-w-0 bg-transparent text-base font-bold text-slate-950 dark:text-slate-100 outline-none"
              />
            </div>

            {/* Lastname Input */}
            <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-slate-800/50 p-4 transition-all focus-within:border-bird-blue focus-within:ring-2 focus-within:ring-bird-blue/20">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-400">{t('userProfile.fields.lastname')}</label>
                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <input
                type="text"
                name="lastname"
                value={formData.lastname}
                onChange={handleInputChange}
                maxLength={16}
                autoComplete="family-name"
                className="w-full min-w-0 bg-transparent text-base font-bold text-slate-950 dark:text-slate-100 outline-none"
              />
            </div>

            {/* Phone Input */}
            <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-slate-800/50 p-4 transition-all focus-within:border-bird-blue focus-within:ring-2 focus-within:ring-bird-blue/20">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-400">{t('userProfile.fields.phone')}</label>
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
                maxLength={9}
                autoComplete="tel"
                placeholder="6074-6649"
                className="w-full bg-transparent text-base font-bold text-slate-950 dark:text-slate-100 placeholder-slate-400 outline-none"
              />
            </div>

            {/* Username Input */}
            <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-slate-800/50 p-4 transition-all focus-within:border-bird-blue focus-within:ring-2 focus-within:ring-bird-blue/20">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-400">{t('userProfile.fields.username')}</label>
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
                placeholder={isUsernameLocked && nextUsernameChangeDate ? `Disponible ${nextUsernameChangeDate.toLocaleDateString()}` : '@username'}
                disabled={isUsernameLocked}
                title={isUsernameLocked && nextUsernameChangeDate ? `Puedes cambiar tu usuario nuevamente el ${nextUsernameChangeDate.toLocaleDateString()}` : undefined}
                className="w-full bg-transparent text-base font-bold text-slate-950 dark:text-slate-100 placeholder-slate-400 outline-none disabled:cursor-not-allowed disabled:text-slate-500"
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
              {isSaving ? t('userProfile.saving') : t('userProfile.save')}
            </button>

            <button
              type="button"
              onClick={logout}
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-bold text-sm border border-rose-200 dark:border-rose-900/50 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors"
            >
              {t('userProfile.logout')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserProfile;
