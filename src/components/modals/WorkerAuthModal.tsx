import React, { useState, useEffect } from 'react';
import { AuthMode } from '../../types';
import { API_ENDPOINTS } from '../../config/api';
import { Notyf } from 'notyf';
import 'notyf/notyf.min.css';

interface WorkerAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'signin' | 'signup';
  onSuccess?: () => void;
}

export const WorkerAuthModal: React.FC<WorkerAuthModalProps> = ({ isOpen, onClose, mode: initialMode, onSuccess }) => {
  const [view, setView] = useState<'signin' | 'signup'>(initialMode);
  
  const notyf = new Notyf({
    position: { x: 'right', y: 'bottom' },
    ripple: true,
  });
  
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

  useEffect(() => {
    if (isOpen) {
      setView(initialMode);
      setError('');
    }
  }, [initialMode, isOpen]);

  if (!isOpen) return null;

  const isSignup = view === 'signup';
  const toggleView = () => {
    setView(isSignup ? 'signin' : 'signup');
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (view === 'signup') {
        if (formData.password !== formData.confirmPassword) {
          notyf.error('Passwords do not match');
          setLoading(false);
          return;
        }

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

        if (!response.ok) {
          notyf.error(data.error || 'Registration failed');
          setLoading(false);
          return;
        }

        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        notyf.success('Pro account created successfully!');
        setLoading(false);
        onClose();
        setTimeout(() => {
          onSuccess?.();
        }, 100);
      } else {
        const response = await fetch(API_ENDPOINTS.auth.login, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formData.email,
            password: formData.password
          })
        });

        const data = await response.json();

        if (!response.ok) {
          notyf.error(data.error || 'Login failed');
          setLoading(false);
          return;
        }

        if (data.user.rol !== 'worker') {
          notyf.error('This account is not registered as a worker');
          setLoading(false);
          return;
        }

        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        notyf.success('Welcome back, Pro!');
        setLoading(false);
        onClose();
        setTimeout(() => {
          onSuccess?.();
        }, 100);
      }
    } catch (err) {
      console.error('[WorkerAuthModal] Error:', err);
      notyf.error('Connection error. Please try again.');
      setLoading(false);
    }
  };

  const transitionClass = "transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md animate-fade-in-up"
        style={{ animationDuration: '0.4s' }}
        onClick={onClose}
      />

      <div className="hidden md:flex relative w-[850px] h-[580px] bg-white rounded-3xl shadow-2xl overflow-hidden text-gray-900 ring-1 ring-gray-200 animate-zoom-in">

        <div
          className={`absolute top-0 bottom-0 left-0 w-1/2 bg-gradient-to-br from-bird-orange to-bird-gold z-20 ${transitionClass}`}
          style={{
            transform: isSignup ? 'translateX(0%)' : 'translateX(100%)',
          }}
        >
          <div className="absolute top-[-20%] -left-[20%] w-60 h-60 bg-white/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-[-20%] -right-[20%] w-60 h-60 bg-bird-yellow/30 rounded-full blur-3xl pointer-events-none" />
        </div>

        <div
          className={`absolute top-0 left-0 w-1/2 h-full z-30 flex flex-col items-center justify-center text-center px-12 gap-6 ${transitionClass}
           ${isSignup ? 'translate-x-0 opacity-100 pointer-events-auto' : '-translate-x-[20%] opacity-0 pointer-events-none'}`}
        >
          <h2 className="text-4xl font-bold tracking-tight text-white">Welcome Back Pro!</h2>
          <p className="text-sm text-white/90 leading-relaxed">
            Access your professional dashboard to manage your services and connect with clients.
          </p>
          <button onClick={toggleView} className="mt-2 px-10 py-3 rounded-full border border-white/50 bg-white/10 text-white font-bold hover:bg-white hover:text-bird-orange transition-all duration-300 backdrop-blur-sm shadow-lg">
            SIGN IN
          </button>
        </div>

        <div
          className={`absolute top-0 left-1/2 w-1/2 h-full z-10 flex flex-col items-center justify-center px-10 ${transitionClass}
           ${isSignup ? 'translate-x-0 opacity-100 z-10' : 'translate-x-[20%] opacity-0 z-0'}`}
        >
          <h2 className="text-3xl font-bold mb-2 text-bird-orange">Join as a Pro</h2>
          <p className="text-xs text-gray-500 mb-4">Start earning by offering your services</p>

          <form className="w-full flex flex-col gap-2.5" onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-gray-50 rounded-lg p-1 border border-gray-200 focus-within:border-bird-orange/50 transition-colors">
                <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} type="text" placeholder="First Name" className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 outline-none placeholder-gray-500" />
              </div>
              <div className="bg-gray-50 rounded-lg p-1 border border-gray-200 focus-within:border-bird-orange/50 transition-colors">
                <input required value={formData.lastname} onChange={e => setFormData({...formData, lastname: e.target.value})} type="text" placeholder="Last Name" className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 outline-none placeholder-gray-500" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-gray-50 rounded-lg p-1 border border-gray-200 focus-within:border-bird-orange/50 transition-colors">
                <input value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} type="text" placeholder="Username (Optional)" className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 outline-none placeholder-gray-500" />
              </div>
              <div className="bg-gray-50 rounded-lg p-1 border border-gray-200 focus-within:border-bird-orange/50 transition-colors">
                <input required value={formData.phone_number} onChange={e => setFormData({...formData, phone_number: e.target.value})} type="tel" placeholder="Phone Number" className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 outline-none placeholder-gray-500" />
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-1 border border-gray-200 focus-within:border-bird-orange/50 transition-colors">
              <input required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} type="email" placeholder="Email Address" className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 outline-none placeholder-gray-500" />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-gray-50 rounded-lg p-1 border border-gray-200 focus-within:border-bird-orange/50 transition-colors">
                <input required value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} type="password" placeholder="Password" className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 outline-none placeholder-gray-500" />
              </div>
              <div className="bg-gray-50 rounded-lg p-1 border border-gray-200 focus-within:border-bird-orange/50 transition-colors">
                <input required value={formData.confirmPassword} onChange={e => setFormData({...formData, confirmPassword: e.target.value})} type="password" placeholder="Confirm Password" className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 outline-none placeholder-gray-500" />
              </div>
            </div>

            <button disabled={loading} type="submit" className="mt-2 w-full py-3 rounded-full bg-gradient-to-r from-bird-orange to-bird-gold text-white font-bold text-sm tracking-wide shadow-lg shadow-bird-orange/20 hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? 'PROCESSING...' : 'CREATE PRO ACCOUNT'}
            </button>
          </form>
        </div>

        <div
          className={`absolute top-0 left-1/2 w-1/2 h-full z-30 flex flex-col items-center justify-center text-center px-12 gap-6 ${transitionClass}
           ${!isSignup ? 'translate-x-0 opacity-100 pointer-events-auto' : 'translate-x-[20%] opacity-0 pointer-events-none'}`}
        >
          <h2 className="text-4xl font-bold tracking-tight text-white">Join Fixlife Pros!</h2>
          <p className="text-sm text-white/90 leading-relaxed">
            Enter your professional details and start earning by offering your services to clients.
          </p>
          <button onClick={toggleView} className="mt-2 px-10 py-3 rounded-full border border-white/50 bg-white/10 text-white font-bold hover:bg-white hover:text-bird-orange transition-all duration-300 backdrop-blur-sm shadow-lg">
            SIGN UP
          </button>
        </div>

        <div
          className={`absolute top-0 left-0 w-1/2 h-full z-10 flex flex-col items-center justify-center px-14 ${transitionClass}
           ${!isSignup ? 'translate-x-0 opacity-100 z-10' : '-translate-x-[20%] opacity-0 z-0'}`}
        >
          <h2 className="text-3xl font-bold mb-2 text-bird-orange">Pro Sign In</h2>
          <p className="text-xs text-gray-500 mb-6">Welcome back to your dashboard</p>

          <form className="w-full flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="bg-gray-50 rounded-lg p-1 border border-gray-200 focus-within:border-bird-orange/50 transition-colors">
              <input required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} type="email" placeholder="Email Address" className="w-full bg-transparent px-3 py-3 text-sm text-gray-900 outline-none placeholder-gray-500" />
            </div>
            <div className="bg-gray-50 rounded-lg p-1 border border-gray-200 focus-within:border-bird-orange/50 transition-colors">
              <input required value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} type="password" placeholder="Password" className="w-full bg-transparent px-3 py-3 text-sm text-gray-900 outline-none placeholder-gray-500" />
            </div>
            
            <a href="#" className="text-xs text-gray-500 hover:text-bird-orange transition-colors self-end my-1">Forgot your password?</a>
            
            <button disabled={loading} type="submit" className="w-full py-4 rounded-full bg-gradient-to-r from-bird-orange to-bird-gold text-white font-bold text-sm tracking-wide shadow-lg shadow-bird-orange/20 hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? 'PROCESSING...' : 'SIGN IN'}
            </button>
          </form>
        </div>
      </div>

      {/* MOBILE VERSION */}
      <div className="md:hidden relative w-full max-w-[380px] bg-white/95 backdrop-blur-xl border border-gray-200 rounded-3xl shadow-2xl overflow-hidden flex flex-col min-h-[620px] animate-zoom-in">

        <div className="absolute inset-0 pointer-events-none">
          <div className={`absolute top-[-20%] left-[-20%] w-[300px] h-[300px] rounded-full blur-[80px] transition-all duration-700 
                ${isSignup ? 'bg-bird-yellow/30 translate-x-[50%]' : 'bg-bird-orange/20 translate-x-0'}`}
          />
          <div className={`absolute bottom-[-10%] right-[-10%] w-[250px] h-[250px] rounded-full blur-[60px] transition-all duration-700
                ${isSignup ? 'bg-bird-orange/20' : 'bg-bird-gold/20'}`}
          />
        </div>

        <div className="relative z-10 flex flex-col h-full p-6 overflow-y-auto custom-scrollbar">

          <div className="w-full h-12 bg-gray-100 rounded-full p-1 flex relative mb-6 shrink-0 backdrop-blur-sm border border-gray-200">
            <div className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full shadow-lg transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]
                   ${isSignup
                ? 'left-[50%] bg-bird-gold'
                : 'left-1 bg-bird-orange'}`}
            />

            <button
              onClick={() => { setView('signin'); setError(''); }}
              className={`flex-1 relative z-10 text-xs font-bold tracking-wide transition-colors duration-300 flex items-center justify-center
                  ${!isSignup ? 'text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >
              SIGN IN
            </button>
            <button
              onClick={() => { setView('signup'); setError(''); }}
              className={`flex-1 relative z-10 text-xs font-bold tracking-wide transition-colors duration-300 flex items-center justify-center
                  ${isSignup ? 'text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >
              SIGN UP
            </button>
          </div>

          <div className="flex-1 flex flex-col justify-center transition-all duration-500">

            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {isSignup ? "Join as a Pro" : "Pro Sign In"}
              </h2>
              <p className="text-xs text-gray-600 px-4">
                {isSignup
                  ? "Start earning by offering your services."
                  : "Enter your credentials to access your dashboard."}
              </p>
            </div>

            <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
              {isSignup && (
                <div className="animate-fade-in-up space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white rounded-xl px-4 py-3 border border-gray-200 focus-within:border-bird-orange/50 transition-colors shadow-sm">
                      <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} type="text" placeholder="First Name" className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder-gray-500" />
                    </div>
                    <div className="bg-white rounded-xl px-4 py-3 border border-gray-200 focus-within:border-bird-orange/50 transition-colors shadow-sm">
                      <input required value={formData.lastname} onChange={e => setFormData({...formData, lastname: e.target.value})} type="text" placeholder="Last Name" className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder-gray-500" />
                    </div>
                  </div>
                  <div className="bg-white rounded-xl px-4 py-3 border border-gray-200 focus-within:border-bird-orange/50 transition-colors shadow-sm">
                    <input value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} type="text" placeholder="Username (Optional)" className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder-gray-500" />
                  </div>
                  <div className="bg-white rounded-xl px-4 py-3 border border-gray-200 focus-within:border-bird-orange/50 transition-colors shadow-sm">
                    <input required value={formData.phone_number} onChange={e => setFormData({...formData, phone_number: e.target.value})} type="tel" placeholder="Phone Number" className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder-gray-500" />
                  </div>
                </div>
              )}

              <div className="bg-white rounded-xl px-4 py-3 border border-gray-200 focus-within:border-bird-orange/50 transition-colors shadow-sm">
                <input required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} type="email" placeholder="Email Address" className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder-gray-500" />
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div className="bg-white rounded-xl px-4 py-3 border border-gray-200 focus-within:border-bird-orange/50 transition-colors shadow-sm">
                  <input required value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} type="password" placeholder="Password" className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder-gray-500" />
                </div>
                {isSignup && (
                  <div className="bg-white rounded-xl px-4 py-3 border border-gray-200 focus-within:border-bird-orange/50 transition-colors shadow-sm animate-fade-in-up">
                    <input required value={formData.confirmPassword} onChange={e => setFormData({...formData, confirmPassword: e.target.value})} type="password" placeholder="Confirm Password" className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder-gray-500" />
                  </div>
                )}
              </div>

              {!isSignup && (
                <div className="flex justify-end mt-1">
                  <a href="#" className="text-xs text-gray-600 hover:text-bird-orange transition-colors">Forgot password?</a>
                </div>
              )}

              <button disabled={loading} type="submit" className={`mt-4 w-full py-4 rounded-xl font-bold text-sm tracking-wide shadow-lg active:scale-[0.98] transition-all duration-300
                      ${isSignup
                  ? 'bg-gradient-to-r from-bird-yellow to-bird-gold text-gray-900 shadow-bird-yellow/20'
                  : 'bg-gradient-to-r from-bird-orange to-bird-gold text-white shadow-bird-orange/20'
                } disabled:opacity-50 disabled:cursor-not-allowed`}>
                {loading ? 'PROCESSING...' : isSignup ? "Create Pro Account" : "Sign In"}
              </button>
            </form>

          </div>
        </div>
      </div>

    </div>
  );
};
