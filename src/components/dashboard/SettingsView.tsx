import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Notyf } from 'notyf';
import 'notyf/notyf.min.css';
import { API_URL } from '../../config/api';
import { getAuthUser, getToken as getSessionToken, logoutAuthSession, updateStoredAuthUser } from '../../utils/session';
import { WorkerAvailabilitySection } from './WorkerAvailabilitySection';

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
    () =>
      new Notyf({
        position: { x: 'left', y: 'bottom' },
        duration: 3200,
        ripple: true,
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
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) return imagePath;
    return `${API_URL}/uploads/${encodeURIComponent(imagePath)}`;
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
          image_full_url: item.image_full_url || toPublicUrl(item.image_url) || undefined,
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
          phone_number: phoneNumber,
          bio,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not save settings.');
      notyf.success('Phone and description updated.');
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
          image_full_url: item.image_full_url || toPublicUrl(item.image_url) || undefined,
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
      notyf.success('Portfolio photo deleted.');
    } catch (error: any) {
      notyf.error(error.message || 'Error deleting photo.');
    }
  };

  const handleSignOut = () => {
    logoutAuthSession('worker');
    navigate('/', { replace: true });
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
      <div className="rounded-3xl border border-cyan-200 bg-gradient-to-br from-cyan-600 to-sky-500 p-5 md:p-6 shadow-lg transition-all duration-300 hover:shadow-cyan-500/30 hover:-translate-y-0.5">
        <div className="text-white font-bold text-xl mb-1">Profile</div>
        <p className="text-cyan-50 text-xs mb-4">Change your profile photo before saving.</p>

        <div className="flex flex-col md:flex-row items-center md:items-end gap-5">
          <div className="relative">
            <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-white shadow-lg bg-slate-100 transition-transform duration-300 hover:scale-105">
              {displayProfileImage && !profileImgBroken ? (
                <img
                  src={displayProfileImage}
                  alt="Profile"
                  className="w-full h-full object-cover"
                  onError={() => setProfileImgBroken(true)}
                />
              ) : (
                <img src="/mascot.webp" alt="Profile fallback" className="w-full h-full object-cover" />
              )}
            </div>
            <div className="absolute -right-1 -bottom-1 w-8 h-8 rounded-full bg-white text-cyan-600 font-bold flex items-center justify-center shadow">
              +
            </div>
          </div>

          <div className="flex-1 w-full space-y-3">
            <label className="w-full rounded-xl p-3 bg-white/90 border border-cyan-100 flex items-center justify-between gap-3 cursor-pointer hover:bg-white transition">
              <span className="text-sm text-gray-700">Upload profile image (PNG, JPG or WEBP)</span>
              <span className="bg-cyan-600 text-white px-3 py-1.5 rounded-lg text-sm font-semibold">Dropify</span>
              <input
                type="file"
                accept={PROFILE_IMAGE_ACCEPT}
                className="hidden"
                onChange={handleProfileImageSelect}
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleSaveProfileImage}
                disabled={uploadingProfileImage}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold hover:bg-black disabled:bg-gray-400"
              >
                {uploadingProfileImage ? 'Saving...' : 'Save Profile Image'}
              </button>
              <button
                onClick={handleRemoveProfileImage}
                disabled={uploadingProfileImage || (!profileImage && !profileImagePreview)}
                className="px-4 py-2 rounded-xl border border-red-200 bg-red-50 text-red-600 font-bold hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Remove Photo
              </button>
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
          <h3 className="text-2xl font-bold text-gray-900 mb-5">Personal Information</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">First Name</label>
                <input value={firstName} disabled className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-gray-600" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Last Name</label>
                <input value={lastName} disabled className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-gray-600" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Current Email</label>
              <input value={currentEmail} disabled className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-gray-600" />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Phone Number</label>
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
            {savingInfo ? 'Saving...' : 'Save Phone & Description'}
          </button>
        </div>

        <div>
          <div className="bg-white rounded-3xl border border-gray-200 p-5 md:p-6 shadow-sm">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Change Email (Token Verification)</h3>
            <div className="space-y-3">
              <input
                type="email"
                value={newEmail}
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
                onChange={(e) => setEmailToken(e.target.value)}
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

      <div className="bg-white rounded-3xl border border-gray-200 p-5 md:p-6 shadow-sm transition-all duration-300 hover:shadow-md">
        <h3 className="text-2xl font-bold text-gray-900 mb-1">Portfolio (max 10 photos)</h3>
        <p className="text-gray-600 mb-4">{portfolio.length}/10 uploaded</p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1 border border-gray-200 rounded-2xl p-4 bg-gray-50 transition-all duration-300 hover:shadow-sm">
            <input
              value={portfolioDescription}
              onChange={(e) => setPortfolioDescription(sanitizeSafeTextInput(e.target.value, 500))}
              placeholder="Optional description"
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 mb-3"
            />
            <p className="mb-3 text-[11px] text-gray-500">Use only letters, numbers, spaces, and basic punctuation.</p>

            <label className="w-full border-2 border-dashed border-gray-300 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-blue-400 transition bg-white hover:bg-blue-50/40">
              <div className="text-2xl font-bold text-blue-500">+</div>
              <div className="font-semibold text-gray-700 text-sm">Dropify Upload</div>
              <div className="text-gray-500 text-xs">PNG, JPG or WEBP · max 5MB each · no GIF</div>
              <span className="bg-blue-500 text-white px-3 py-1.5 rounded-lg text-sm font-bold">Select Files</span>
              <input type="file" className="hidden" multiple accept={PROFILE_IMAGE_ACCEPT} onChange={handlePortfolioSelect} />
            </label>

            {portfolioPreviews.length > 0 && (
              <>
                <div className="text-xs font-semibold text-gray-600 mt-3 mb-2">Pending preview</div>
                <div className="grid grid-cols-3 gap-2">
                  {portfolioPreviews.map((preview, idx) => (
                    <img key={`${preview}-${idx}`} src={preview} alt="preview" className="w-full h-16 object-cover rounded-lg border border-gray-200" />
                  ))}
                </div>
                <button
                  onClick={handleUploadPortfolio}
                  disabled={uploadingPortfolio}
                  className="mt-3 w-full px-4 py-2.5 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:bg-gray-300"
                >
                  {uploadingPortfolio ? 'Uploading...' : 'Upload'}
                </button>
              </>
            )}
          </div>

          <div className="lg:col-span-2 border border-gray-200 rounded-2xl p-4 transition-all duration-300 hover:shadow-sm">
            <div className="text-sm font-semibold text-gray-700 mb-3">Your portfolio</div>
            {portfolio.length === 0 ? (
              <div className="h-28 rounded-xl border border-dashed border-gray-300 flex items-center justify-center text-sm text-gray-500">
                No photos uploaded yet
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                {portfolio.map((photo) => (
                  <div key={photo.id_photo} className="group relative rounded-xl overflow-hidden border border-gray-200 bg-gray-100 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
                    {brokenPortfolio[photo.id_photo] ? (
                      <div className="w-full h-24 flex items-center justify-center text-xs text-gray-500 bg-gray-100">Image not found</div>
                    ) : (
                      <>
                        <img
                          src={photo.image_full_url || toPublicUrl(photo.image_url) || ''}
                          alt="Portfolio"
                          className="w-full h-24 object-cover transition duration-300 group-hover:scale-110 group-hover:blur-[1px]"
                          onError={() =>
                            setBrokenPortfolio((prev) => ({ ...prev, [photo.id_photo]: true }))
                          }
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition duration-300" />
                      </>
                    )}
                    <button
                      onClick={() => handleDeletePortfolio(photo.id_photo)}
                      className="absolute top-1.5 right-1.5 w-8 h-8 rounded-full bg-red-500/90 text-white flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition hover:bg-red-600 shadow"
                      title="Delete photo"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4h8v2m-1 0v14a2 2 0 01-2 2h-2a2 2 0 01-2-2V6" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <button
          onClick={handleSignOut}
          className="w-full py-3 rounded-xl bg-red-50 text-red-600 border border-red-200 font-bold hover:bg-red-100"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
};
