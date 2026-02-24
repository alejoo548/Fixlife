import React, { useState } from 'react';
import { Briefcase, Mail, Lock, User, Phone } from 'lucide-react';
import { API_ENDPOINTS } from '../../config/api';

interface WorkerAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'signin' | 'signup';
  onSuccess?: () => void;
}

export const WorkerAuthModal: React.FC<WorkerAuthModalProps> = ({ isOpen, onClose, mode: initialMode, onSuccess }) => {
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [formData, setFormData] = useState({
    name: '',
    lastname: '',
    email: '',
    phone_number: '',
    password: '',
    confirmPassword: '',
    username: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    console.log('[WorkerAuthModal] Form submitted, mode:', mode);

    try {
      if (mode === 'signup') {
        if (formData.password !== formData.confirmPassword) {
          setError('Passwords do not match');
          setLoading(false);
          return;
        }

        console.log('[WorkerAuthModal] Registering worker...');
        const response = await fetch(API_ENDPOINTS.auth.registerWorker, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.name,
            lastname: formData.lastname,
            email: formData.email,
            phone_number: formData.phone_number,
            password: formData.password,
            username: formData.username || undefined
          })
        });

        const data = await response.json();
        console.log('[WorkerAuthModal] Register response:', response.ok);

        if (!response.ok) {
          setError(data.error || 'Registration failed');
          setLoading(false);
          return;
        }

        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setLoading(false);
        console.log('[WorkerAuthModal] Registration successful, onSuccess exists?', !!onSuccess);
        onClose();
        setTimeout(() => {
          console.log('[WorkerAuthModal] Calling onSuccess after registration');
          onSuccess?.();
        }, 100);
      } else {
        console.log('[WorkerAuthModal] Logging in...');
        const response = await fetch(API_ENDPOINTS.auth.login, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formData.email,
            password: formData.password
          })
        });

        const data = await response.json();
        console.log('[WorkerAuthModal] Login response:', response.ok, 'rol:', data.user?.rol);

        if (!response.ok) {
          setError(data.error || 'Login failed');
          setLoading(false);
          return;
        }

        if (data.user.rol !== 'worker') {
          setError('This account is not registered as a worker');
          setLoading(false);
          return;
        }

        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setLoading(false);
        console.log('[WorkerAuthModal] Login successful, onSuccess exists?', !!onSuccess);
        onClose();
        setTimeout(() => {
          console.log('[WorkerAuthModal] Calling onSuccess after login');
          onSuccess?.();
        }, 100);
      }
    } catch (err) {
      console.error('[WorkerAuthModal] Error:', err);
      setError('Connection error. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
      
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 animate-zoom-in">
        <div className="flex items-center justify-center mb-6">
          <div className="p-3 bg-bird-blue/10 rounded-full">
            <Briefcase className="w-8 h-8 text-bird-blue" />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">
          {mode === 'signup' ? 'Join as a Pro' : 'Pro Sign In'}
        </h2>
        <p className="text-sm text-center text-gray-600 mb-6">
          {mode === 'signup' 
            ? 'Start earning by offering your services' 
            : 'Access your professional dashboard'}
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="First Name"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:border-bird-blue focus:ring-2 focus:ring-bird-blue/20 outline-none transition-all"
                  />
                </div>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Last Name"
                    required
                    value={formData.lastname}
                    onChange={(e) => setFormData({...formData, lastname: e.target.value})}
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:border-bird-blue focus:ring-2 focus:ring-bird-blue/20 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Username (optional)"
                  value={formData.username}
                  onChange={(e) => setFormData({...formData, username: e.target.value})}
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:border-bird-blue focus:ring-2 focus:ring-bird-blue/20 outline-none transition-all"
                />
              </div>

              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="tel"
                  placeholder="Phone Number"
                  required
                  value={formData.phone_number}
                  onChange={(e) => setFormData({...formData, phone_number: e.target.value})}
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:border-bird-blue focus:ring-2 focus:ring-bird-blue/20 outline-none transition-all"
                />
              </div>
            </>
          )}

          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="email"
              placeholder="Email Address"
              required
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:border-bird-blue focus:ring-2 focus:ring-bird-blue/20 outline-none transition-all"
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="password"
              placeholder="Password"
              required
              value={formData.password}
              onChange={(e) => setFormData({...formData, password: e.target.value})}
              className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:border-bird-blue focus:ring-2 focus:ring-bird-blue/20 outline-none transition-all"
            />
          </div>

          {mode === 'signup' && (
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="password"
                placeholder="Confirm Password"
                required
                value={formData.confirmPassword}
                onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:border-bird-blue focus:ring-2 focus:ring-bird-blue/20 outline-none transition-all"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-bird-blue text-white font-semibold rounded-lg hover:bg-bird-darkBlue transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing...' : mode === 'signup' ? 'Create Pro Account' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
            className="text-sm text-gray-600 hover:text-bird-blue transition-colors"
          >
            {mode === 'signup' 
              ? 'Already have an account? Sign in' 
              : "Don't have an account? Sign up"}
          </button>
        </div>
      </div>
    </div>
  );
};
