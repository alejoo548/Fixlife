import React, { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config/api';
import { uploadProfileImage } from '../services/authService';

interface UserProfileProps {
  onBack: () => void;
}

const UserProfile: React.FC<UserProfileProps> = ({ onBack }) => {
  const { user, logout, updateUser } = useAuth();
  const [isUploading, setIsUploading] = useState(false);

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
    if (String(raw).startsWith('http://') || String(raw).startsWith('https://')) {
      return raw;
    }
    return `${API_URL}/uploads/${raw}`;
  }, [user?.profile_image]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Only image files are allowed');
      e.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Image size must be 5MB or less');
      e.target.value = '';
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      alert('Session expired. Please sign in again.');
      return;
    }

    setIsUploading(true);
    try {
      const { data } = await uploadProfileImage(file, token);
      const nextUser = {
        ...user,
        profile_image: data.profile_image
      };
      updateUser(nextUser);
      alert('Profile image updated successfully');
    } catch (error: any) {
      alert(error?.response?.data?.error || 'Error uploading image');
    } finally {
      setIsUploading(false);
      e.target.value = '';
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
            <p className="text-gray-600 font-medium mt-1">{user?.email || 'No email available'}</p>
          </div>
        </div>

        <div className="mb-8 rounded-2xl border border-gray-200 bg-gray-50/70 p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-3">Profile photo</p>
          <label className="inline-flex items-center gap-3 px-4 py-2 rounded-xl bg-bird-blue text-white font-bold cursor-pointer hover:bg-bird-darkBlue transition-colors">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
              disabled={isUploading}
            />
            {isUploading ? 'Uploading...' : 'Upload photo'}
          </label>
          <p className="text-xs text-gray-500 mt-2">Allowed: images only, max 5MB.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4">
            <p className="text-xs uppercase tracking-wider text-gray-500 font-bold">Name</p>
            <p className="text-gray-900 font-semibold mt-1">{user?.name || '-'}</p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4">
            <p className="text-xs uppercase tracking-wider text-gray-500 font-bold">Lastname</p>
            <p className="text-gray-900 font-semibold mt-1">{user?.lastname || '-'}</p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4">
            <p className="text-xs uppercase tracking-wider text-gray-500 font-bold">Email</p>
            <p className="text-gray-900 font-semibold mt-1 break-words">{user?.email || '-'}</p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4">
            <p className="text-xs uppercase tracking-wider text-gray-500 font-bold">Role</p>
            <p className="text-gray-900 font-semibold mt-1 capitalize">{user?.rol || '-'}</p>
          </div>
        </div>

        <div className="mt-8">
          <button
            onClick={logout}
            className="px-5 py-3 rounded-xl bg-red-50 text-red-600 font-bold border border-red-200 hover:bg-red-100 transition-colors"
          >
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;
