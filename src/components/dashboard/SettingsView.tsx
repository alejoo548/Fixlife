import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera,
  CheckCircle2,
  Eye,
  ImagePlus,
  Images,
  LogOut,
  Mail,
  Phone,
  Pencil,
  Save,
  ShieldCheck,
  Trash2,
  UploadCloud,
  UserRound,
  X,
} from 'lucide-react';
import { showSweetToast } from '../../utils/sweetAlert';
import { API_URL } from '../../config/api';
import { getAuthUser, getToken as getSessionToken, logoutAndReload, updateStoredAuthUser } from '../../utils/session';
import { WorkerAvailabilitySection } from './WorkerAvailabilitySection';
import { normalizeImageUrl } from '../../utils/imageUrls';

type PortfolioItem = {
  id_photo: number;
  image_url: string;
  image_full_url?: string;
  description?: string | null;
};

const SAFE_TEXT_ALLOWED_CHAR = /[\p{L}\p{N}\s.,\-_'":;!?()]/u;
const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_PROFILE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const PROFILE_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp';

const sanitizeSafeTextInput = (value: string, maxLen = 500) =>
  Array.from(value)
    .filter((char) => SAFE_TEXT_ALLOWED_CHAR.test(char))
    .join('')
    .slice(0, maxLen);

export const SettingsView: React.FC = () => {
  const navigate = useNavigate();
  const notyf = useMemo(
    () => ({
      success: (message: string) => void showSweetToast({ tone: 'success', message }),
      error: (message: string) => void showSweetToast({ tone: 'error', message }),
    }),
    []
  );

  const [loading, setLoading] = useState(true);
  const [savingInfo, setSavingInfo] = useState(false);
  const [sendingEmailToken, setSendingEmailToken] = useState(false);
  const [verifyingEmailToken, setVerifyingEmailToken] = useState(false);
  const [uploadingProfileImage, setUploadingProfileImage] = useState(false);
  const [uploadingPortfolio, setUploadingPortfolio] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [currentEmail, setCurrentEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [bio, setBio] = useState('');
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(null);
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);

  const [newEmail, setNewEmail] = useState('');
  const [emailToken, setEmailToken] = useState('');

  const [portfolioDescription, setPortfolioDescription] = useState('');
  const [portfolioFiles, setPortfolioFiles] = useState<File[]>([]);
  const [portfolioPreviews, setPortfolioPreviews] = useState<string[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [selectedPortfolioPhoto, setSelectedPortfolioPhoto] = useState<PortfolioItem | null>(null);
  const [selectedPortfolioDescription, setSelectedPortfolioDescription] = useState('');
  const [savingPortfolioDescription, setSavingPortfolioDescription] = useState(false);
  const [profileImgBroken, setProfileImgBroken] = useState(false);
  const [brokenPortfolio, setBrokenPortfolio] = useState<Record<number, boolean>>({});

  const authFetch = async (url: string, options: RequestInit = {}) => {
    const token = getSessionToken('worker');
    if (!token) throw new Error('No token found. Please sign in again.');
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(url, { ...options, headers });
  };

  const toPublicUrl = (imagePath?: string | null) => {
    if (!imagePath) return null;
    return normalizeImageUrl(imagePath) || null;
  };

  const loadData = async () => {
    try {
      const res = await authFetch(`${API_URL}/api/worker/me`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error loading profile data.');

      const user = data?.user || {};
      const workerProfile = data?.worker_profile || {};
      const portfolioItems = Array.isArray(data?.portfolio) ? data.portfolio : [];

      setFirstName(user.name || '');
      setLastName(user.lastname || '');
      setCurrentEmail(user.email || '');
      setPhoneNumber(user.phone_number || '');
      setBio(workerProfile.bio || '');
      setProfileImage(user.profile_image_url || toPublicUrl(user.profile_image));
      setProfileImgBroken(false);
      setProfileImagePreview(null);
      setPortfolio(
        portfolioItems.map((item: PortfolioItem) => ({
          ...item,
          image_full_url: toPublicUrl(item.image_full_url) || toPublicUrl(item.image_url) || undefined,
        }))
      );
    } catch (error: any) {
      notyf.error(error.message || 'Could not load settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(
    () => () => {
      if (profileImagePreview) URL.revokeObjectURL(profileImagePreview);
    },
    [profileImagePreview]
  );

  useEffect(
    () => () => {
      portfolioPreviews.forEach((preview) => URL.revokeObjectURL(preview));
    },
    [portfolioPreviews]
  );

  const handleProfileImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (!ALLOWED_PROFILE_IMAGE_TYPES.has(file.type)) {
      notyf.error('Use a real PNG, JPG or WEBP image. GIF files are not allowed.');
      return;
    }
    if (file.size > PROFILE_IMAGE_MAX_BYTES) {
      notyf.error('Image is too large. Maximum size is 5MB.');
      return;
    }
    setProfileImageFile(file);
    const preview = URL.createObjectURL(file);
    setProfileImagePreview(preview);
    notyf.success('Profile image selected. Click "Save Profile Image".');
  };

  const handleSaveProfileImage = async () => {
    if (!profileImageFile) {
      notyf.error('Select an image first.');
      return;
    }
    setUploadingProfileImage(true);
    try {
      const formData = new FormData();
      formData.append('profile_image', profileImageFile);
      const res = await authFetch(`${API_URL}/api/worker/profile-image`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not upload profile image.');

      const nextProfileImage = data.profile_image_url || toPublicUrl(data.profile_image);
      setProfileImage(nextProfileImage);
      setProfileImagePreview(null);
      setProfileImageFile(null);
      setProfileImgBroken(false);
      const user = getAuthUser('worker');
      if (user) {
        user.profile_image = data.profile_image ?? null;
        user.profile_image_url = nextProfileImage;
        updateStoredAuthUser(user, 'worker');
      }
      notyf.success('Profile image updated.');
    } catch (error: any) {
      notyf.error(error.message || 'Error updating profile image.');
    } finally {
      setUploadingProfileImage(false);
    }
  };

  const handleRemoveProfileImage = async () => {
    if (!profileImage && !profileImagePreview) {
      notyf.error('No profile image to remove.');
      return;
    }
    setUploadingProfileImage(true);
    try {
      const res = await authFetch(`${API_URL}/api/worker/profile-image`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not remove profile image.');

      setProfileImage(null);
      setProfileImagePreview(null);
      setProfileImageFile(null);
      setProfileImgBroken(false);

      const user = getAuthUser('worker');
      if (user) {
        user.profile_image = null;
        user.profile_image_url = null;
        updateStoredAuthUser(user, 'worker');
      }

      notyf.success('Profile image removed.');
    } catch (error: any) {
      notyf.error(error.message || 'Error removing profile image.');
    } finally {
      setUploadingProfileImage(false);
    }
  };

  const handleSaveInfo = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      notyf.error('First and last name are required.');
      return;
    }
    if (!/^\d{8}$/.test(phoneNumber)) {
      notyf.error('Phone number must be exactly 8 digits.');
      return;
    }
    setSavingInfo(true);
    try {
      const res = await authFetch(`${API_URL}/api/worker/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: firstName.trim(),
          lastname: lastName.trim(),
          phone_number: phoneNumber,
          bio,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not save settings.');
      const storedUser = getAuthUser('worker');
      if (storedUser) {
        updateStoredAuthUser({ ...storedUser, name: firstName.trim(), lastname: lastName.trim() }, 'worker');
      }
      notyf.success('Profile updated.');
    } catch (error: any) {
      notyf.error(error.message || 'Error saving settings.');
    } finally {
      setSavingInfo(false);
    }
  };

  const handleSendEmailToken = async () => {
    setSendingEmailToken(true);
    try {
      const res = await authFetch(`${API_URL}/api/worker/email-change/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_email: newEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not send token.');
      notyf.success('Verification token sent to your new email.');
    } catch (error: any) {
      notyf.error(error.message || 'Error sending token.');
    } finally {
      setSendingEmailToken(false);
    }
  };

  const handleVerifyEmailToken = async () => {
    setVerifyingEmailToken(true);
    try {
      const res = await authFetch(`${API_URL}/api/worker/email-change/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: emailToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not verify token.');
      setCurrentEmail(data?.new_email || newEmail);
      setNewEmail('');
      setEmailToken('');

      const user = getAuthUser('worker');
      if (user) {
        user.email = data?.new_email || user.email;
        updateStoredAuthUser(user, 'worker');
      }

      notyf.success('Email updated successfully.');
    } catch (error: any) {
      notyf.error(error.message || 'Error verifying token.');
    } finally {
      setVerifyingEmailToken(false);
    }
  };

  const handlePortfolioSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;
    e.target.value = '';

    const invalid = selected.find((file) => !ALLOWED_PROFILE_IMAGE_TYPES.has(file.type));
    if (invalid) {
      notyf.error('Use real PNG, JPG or WEBP images. GIF files are not allowed.');
      return;
    }

    const oversized = selected.find((file) => file.size > PROFILE_IMAGE_MAX_BYTES);
    if (oversized) {
      notyf.error(`"${oversized.name}" is larger than the 5MB limit.`);
      return;
    }

    const maxAdd = Math.max(0, 10 - portfolio.length);
    const accepted = selected.slice(0, maxAdd);
    if (accepted.length < selected.length) {
      notyf.error('Portfolio limit is 10 photos.');
    }

    setPortfolioFiles(accepted);
    setPortfolioPreviews(accepted.map((file) => URL.createObjectURL(file)));
    notyf.success(`${accepted.length} file(s) ready to upload.`);
  };

  const handleUploadPortfolio = async () => {
    if (portfolioFiles.length === 0) {
      notyf.error('Select images first.');
      return;
    }
    setUploadingPortfolio(true);
    try {
      const formData = new FormData();
      portfolioFiles.forEach((file) => formData.append('portfolio_images', file));
      formData.append('description', portfolioDescription);

      const res = await authFetch(`${API_URL}/api/worker/portfolio`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not upload portfolio.');

      const nextPortfolio = Array.isArray(data?.portfolio) ? data.portfolio : [];
      setPortfolio(
        nextPortfolio.map((item: PortfolioItem) => ({
          ...item,
          image_full_url: toPublicUrl(item.image_full_url) || toPublicUrl(item.image_url) || undefined,
        }))
      );
      setPortfolioFiles([]);
      setPortfolioPreviews([]);
      setPortfolioDescription('');
      notyf.success('Portfolio updated.');
    } catch (error: any) {
      notyf.error(error.message || 'Error uploading portfolio.');
    } finally {
      setUploadingPortfolio(false);
    }
  };

  const handleDeletePortfolio = async (idPhoto: number) => {
    try {
      const res = await authFetch(`${API_URL}/api/worker/portfolio/${idPhoto}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not delete photo.');
      setPortfolio((prev) => prev.filter((item) => item.id_photo !== idPhoto));
      setSelectedPortfolioPhoto((current) => (current?.id_photo === idPhoto ? null : current));
      notyf.success('Portfolio photo deleted.');
    } catch (error: any) {
      notyf.error(error.message || 'Error deleting photo.');
    }
  };

  const openPortfolioPhoto = (photo: PortfolioItem) => {
    setSelectedPortfolioPhoto(photo);
    setSelectedPortfolioDescription(photo.description || '');
  };

  const handleSavePortfolioDescription = async () => {
    if (!selectedPortfolioPhoto) return;
    setSavingPortfolioDescription(true);
    try {
      const description = sanitizeSafeTextInput(selectedPortfolioDescription, 500);
      const res = await authFetch(`${API_URL}/api/worker/portfolio/${selectedPortfolioPhoto.id_photo}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not update photo description.');

      setPortfolio((prev) =>
        prev.map((item) =>
          item.id_photo === selectedPortfolioPhoto.id_photo
            ? { ...item, description: data?.photo?.description ?? description }
            : item
        )
      );
      setSelectedPortfolioPhoto((current) =>
        current ? { ...current, description: data?.photo?.description ?? description } : current
      );
      notyf.success('Portfolio description updated.');
    } catch (error: any) {
      notyf.error(error.message || 'Error updating description.');
    } finally {
      setSavingPortfolioDescription(false);
    }
  };

  const handleSignOut = () => {
    logoutAndReload('worker');
  };

  const displayProfileImage = profileImagePreview || profileImage;

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-600">
        Loading settings...
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar p-4 md:p-6 lg:p-8 pb-24 md:pb-8 flex flex-col gap-6 animate-fade-in">
      <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col lg:flex-row">
          <div className="w-full shrink-0 rounded-t-[28px] bg-slate-950 p-6 text-white lg:w-[340px] lg:rounded-l-[28px] lg:rounded-tr-none">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-sky-300">Worker profile</p>
                <h2 className="mt-2 truncate text-2xl font-black">{firstName} {lastName}</h2>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-200">
                <ShieldCheck className="h-3.5 w-3.5" />
                Verified
              </span>
            </div>

            <div className="mt-6 flex flex-col items-center text-center">
              <div className="relative h-40 w-40 shrink-0 overflow-hidden rounded-[32px] border border-white/10 bg-white/10 shadow-2xl">
                {displayProfileImage && !profileImgBroken ? (
                  <img
                    src={displayProfileImage}
                    alt={`${firstName} ${lastName}`}
                    className="h-full w-full object-cover"
                    onError={() => setProfileImgBroken(true)}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-slate-900 text-sky-200">
                    <UserRound className="h-16 w-16" />
                  </div>
                )}
                {profileImagePreview && (
                  <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-sky-500 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em]">
                    Preview
                  </span>
                )}
              </div>
              <p className="mt-4 max-w-xs text-sm font-semibold leading-6 text-slate-300">
                This is what clients see before opening your route, chat and portfolio.
              </p>
            </div>
          </div>

          <div className="flex w-full min-w-0 flex-col gap-5 p-5 md:p-6 xl:flex-row">
            <div className="min-w-0 flex-1 space-y-5">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Profile photo</p>
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-sky-700">
                    <Pencil className="h-2.5 w-2.5" />
                    Editable
                  </span>
                </div>
                <h3 className="mt-1 text-xl font-black text-slate-950">Keep your first impression clean</h3>
              </div>
              <label className="group flex cursor-pointer flex-wrap items-center gap-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 transition hover:border-sky-400 hover:bg-sky-50">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-sky-600 shadow-sm">
                    <Camera className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-900">Upload profile image</p>
                    <p className="mt-0.5 text-xs font-semibold text-slate-500">PNG, JPG or WEBP. Maximum 5MB.</p>
                  </div>
                </div>
                <span className="shrink-0 rounded-xl bg-slate-950 px-4 py-2 text-xs font-black text-white transition group-hover:bg-sky-600">
                  Select
                </span>
                <input type="file" accept={PROFILE_IMAGE_ACCEPT} className="hidden" onChange={handleProfileImageSelect} />
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSaveProfileImage}
                  disabled={uploadingProfileImage || !profileImageFile}
                  className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <Save className="h-4 w-4" />
                  {uploadingProfileImage ? 'Saving...' : 'Save photo'}
                </button>
                <button
                  type="button"
                  onClick={handleRemoveProfileImage}
                  disabled={uploadingProfileImage || (!profileImage && !profileImagePreview)}
                  className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-black text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </button>
              </div>
            </div>

            <div className="w-full shrink-0 rounded-2xl border border-slate-200 bg-slate-50 p-4 xl:w-[320px]">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Profile strength</p>
              <div className="mt-4 space-y-3">
                {[
                  { label: 'Profile photo', ready: Boolean(profileImage || profileImagePreview) },
                  { label: 'Phone number', ready: /^\d{8}$/.test(phoneNumber) },
                  { label: 'Bio description', ready: bio.trim().length >= 20 },
                  { label: 'Portfolio photos', ready: portfolio.length > 0 },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2">
                    <span className="text-xs font-black text-slate-700">{item.label}</span>
                    <CheckCircle2 className={`h-4 w-4 ${item.ready ? 'text-emerald-500' : 'text-slate-300'}`} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <WorkerAvailabilitySection
        onError={(message) => notyf.error(message)}
        onSuccess={(message) => notyf.success(message)}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-3xl border border-gray-200 p-5 md:p-6 shadow-sm">
          <h3 className="mb-5 flex items-center gap-2 text-2xl font-black text-gray-900">
            <UserRound className="h-6 w-6 text-sky-500" />
            Personal Information
          </h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase text-gray-500">
                  <UserRound className="h-3.5 w-3.5" />
                  First Name
                </label>
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(sanitizeSafeTextInput(e.target.value, 80))}
                  maxLength={80}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900"
                />
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase text-gray-500">
                  <UserRound className="h-3.5 w-3.5" />
                  Last Name
                </label>
                <input
                  value={lastName}
                  onChange={(e) => setLastName(sanitizeSafeTextInput(e.target.value, 80))}
                  maxLength={80}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase text-gray-500">
                <Mail className="h-3.5 w-3.5" />
                Current Email
              </label>
              <input value={currentEmail} disabled className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-gray-600" />
            </div>

            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase text-gray-500">
                <Phone className="h-3.5 w-3.5" />
                Phone Number
              </label>
              <input
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 8))}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900"
                placeholder="8 digits only"
                inputMode="numeric"
                maxLength={8}
              />
              <p className="text-[11px] text-gray-500 mt-1">Must be exactly 8 digits.</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Description</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(sanitizeSafeTextInput(e.target.value, 500))}
                className="w-full min-h-[110px] bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900"
                placeholder="Tell clients about your experience and services..."
              />
              <p className="mt-1 text-[11px] text-gray-500">Only letters, numbers, spaces, and basic punctuation are allowed.</p>
            </div>
          </div>

          <button
            onClick={handleSaveInfo}
            disabled={savingInfo}
            className="mt-5 px-5 py-3 rounded-xl bg-blue-500 text-white font-bold hover:bg-blue-600 disabled:bg-gray-300"
          >
            {savingInfo ? 'Saving...' : 'Save Profile'}
          </button>
        </div>

        <div>
          <div className="bg-white rounded-3xl border border-gray-200 p-5 md:p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-2xl font-black text-gray-900">
            <Mail className="h-6 w-6 text-amber-500" />
            Change Email
          </h3>
            <div className="space-y-3">
              <input
                type="email"
                value={newEmail}
                maxLength={100}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="new-email@example.com"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3"
              />
              <button
                onClick={handleSendEmailToken}
                disabled={sendingEmailToken}
                className="w-full py-3 rounded-xl bg-amber-500 text-white font-bold hover:bg-amber-600 disabled:bg-gray-300"
              >
                {sendingEmailToken ? 'Sending...' : 'Send Verification Token'}
              </button>
              <input
                value={emailToken}
                maxLength={6}
                inputMode="numeric"
                onChange={(e) => setEmailToken(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter token"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3"
              />
              <button
                onClick={handleVerifyEmailToken}
                disabled={verifyingEmailToken}
                className="w-full py-3 rounded-xl bg-slate-900 text-white font-bold hover:bg-black disabled:bg-gray-300"
              >
                {verifyingEmailToken ? 'Verifying...' : 'Verify Token and Update Email'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Portfolio</p>
            <h3 className="mt-1 text-2xl font-black text-slate-950">Show your finished work</h3>
            <p className="mt-1 text-sm font-semibold text-slate-500">{portfolio.length}/10 photos uploaded</p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-3 py-1.5 text-xs font-black text-sky-700">
            <Images className="h-4 w-4" />
            Client-facing gallery
          </span>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <input
              value={portfolioDescription}
              onChange={(e) => setPortfolioDescription(sanitizeSafeTextInput(e.target.value, 500))}
              placeholder="Optional caption for these photos"
              className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-semibold outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            />
            <p className="mb-3 text-[11px] text-gray-500">Use only letters, numbers, spaces, and basic punctuation.</p>

            <label className="flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white p-5 text-center transition hover:border-sky-400 hover:bg-sky-50">
              <UploadCloud className="h-8 w-8 text-sky-500" />
              <div className="mt-3 text-sm font-black text-slate-900">Add portfolio photos</div>
              <div className="text-gray-500 text-xs">PNG, JPG or WEBP · max 5MB each · no GIF</div>
              <span className="mt-4 inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-xs font-black text-white">
                <ImagePlus className="h-4 w-4" />
                Select files
              </span>
              <input type="file" className="hidden" multiple accept={PROFILE_IMAGE_ACCEPT} onChange={handlePortfolioSelect} />
            </label>

            {portfolioPreviews.length > 0 && (
              <>
                <div className="mt-4 mb-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500">Ready to upload</div>
                <div className="grid grid-cols-3 gap-2">
                  {portfolioPreviews.map((preview, idx) => (
                    <img key={`${preview}-${idx}`} src={preview} alt="Portfolio preview" loading="lazy" className="aspect-square w-full rounded-xl border border-slate-200 object-cover" />
                  ))}
                </div>
                <button
                  onClick={handleUploadPortfolio}
                  disabled={uploadingPortfolio}
                  className="mt-3 w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-sky-700 disabled:bg-slate-300"
                >
                  {uploadingPortfolio ? 'Uploading...' : `Upload ${portfolioFiles.length} photo${portfolioFiles.length === 1 ? '' : 's'}`}
                </button>
              </>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="mb-3 text-sm font-black text-slate-800">Your portfolio</div>
            {portfolio.length === 0 ? (
              <div className="grid min-h-[260px] place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                <div>
                  <Images className="mx-auto h-10 w-10 text-slate-300" />
                  <p className="mt-3 text-sm font-black text-slate-700">No portfolio photos yet</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Add clear before/after or finished-work photos.</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
                {portfolio.map((photo) => (
                  <div key={photo.id_photo} className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
                    {brokenPortfolio[photo.id_photo] ? (
                      <div className="grid aspect-[4/3] place-items-center text-xs font-bold text-slate-500">Image not found</div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => openPortfolioPhoto(photo)}
                          className="block w-full text-left"
                          title="View and edit portfolio photo"
                        >
                          <img
                            src={photo.image_full_url || toPublicUrl(photo.image_url) || ''}
                            alt="Portfolio"
                            className="aspect-[4/3] w-full object-cover transition duration-300 group-hover:scale-105"
                            onError={() =>
                              setBrokenPortfolio((prev) => ({ ...prev, [photo.id_photo]: true }))
                            }
                          />
                        </button>
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition duration-300" />
                        <button
                          type="button"
                          onClick={() => openPortfolioPhoto(photo)}
                          className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-[11px] font-black text-slate-900 opacity-0 shadow-lg transition group-hover:opacity-100"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View / edit
                        </button>
                        {photo.description && (
                          <p className="absolute inset-x-2 bottom-11 line-clamp-2 rounded-xl bg-slate-950/80 px-2 py-1.5 text-[11px] font-bold leading-4 text-white opacity-0 transition group-hover:opacity-100">
                            {photo.description}
                          </p>
                        )}
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeletePortfolio(photo.id_photo)}
                      className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-red-500 text-white shadow-lg transition hover:bg-red-600"
                      title="Delete photo"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedPortfolioPhoto && (
        <div className="fixed inset-0 z-[900] grid place-items-center bg-slate-950/72 p-4 backdrop-blur-md">
          <div className="grid max-h-[86vh] w-full max-w-4xl overflow-hidden rounded-[24px] border border-white/10 bg-white shadow-2xl lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex min-h-[300px] items-center justify-center bg-slate-950 p-4">
              {brokenPortfolio[selectedPortfolioPhoto.id_photo] ? (
                <div className="grid h-full min-h-[360px] place-items-center text-sm font-black text-slate-300">
                  Image not found
                </div>
              ) : (
                <img
                  src={selectedPortfolioPhoto.image_full_url || toPublicUrl(selectedPortfolioPhoto.image_url) || ''}
                  alt="Portfolio preview"
                  className="max-h-[68vh] w-full rounded-2xl object-contain shadow-[0_24px_70px_rgba(0,0,0,0.28)]"
                  onError={() =>
                    setBrokenPortfolio((prev) => ({ ...prev, [selectedPortfolioPhoto.id_photo]: true }))
                  }
                />
              )}
            </div>

            <div className="custom-scrollbar flex max-h-[86vh] flex-col overflow-y-auto bg-slate-50 p-5 md:p-6">
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-sky-500">
                    Portfolio editor
                  </p>
                  <h3 className="mt-1 text-2xl font-black text-slate-950">Edit photo details</h3>
                  <p className="mt-1 text-sm font-semibold leading-5 text-slate-500">
                    Add a short caption that helps clients understand the work.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPortfolioPhoto(null)}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-900"
                  title="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <label className="block text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                Photo description
              </label>
              <textarea
                value={selectedPortfolioDescription}
                onChange={(e) =>
                  setSelectedPortfolioDescription(sanitizeSafeTextInput(e.target.value, 500))
                }
                className="mt-2 min-h-[150px] w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold leading-6 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                placeholder="Example: Installed and cleaned a full AC unit, checked airflow, and verified cooling performance."
              />
              <div className="mt-2 flex items-center justify-between gap-3 text-[11px] font-semibold text-slate-500">
                <span>Only letters, numbers, spaces, and basic punctuation.</span>
                <span>{selectedPortfolioDescription.length}/500</span>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
                  Client preview
                </p>
                <p className="mt-2 text-sm font-bold leading-6 text-slate-700">
                  {selectedPortfolioDescription.trim() || 'Recent portfolio work'}
                </p>
              </div>

              <div className="mt-auto grid gap-3 pt-5">
                <button
                  type="button"
                  onClick={handleSavePortfolioDescription}
                  disabled={savingPortfolioDescription}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-black text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <Pencil className="h-4 w-4" />
                  {savingPortfolioDescription ? 'Saving...' : 'Save description'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeletePortfolio(selectedPortfolioPhoto.id_photo)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-600 transition hover:bg-red-100"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete this photo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <button
          onClick={handleSignOut}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 py-3 font-bold text-red-600 hover:bg-red-100"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </div>
  );
};
