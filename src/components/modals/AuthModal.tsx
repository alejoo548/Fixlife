import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_ENDPOINTS } from '../../config/api';
import { AuthMode } from '../../types';
import { showSweetToast } from '../../utils/sweetAlert';
import { useAuth } from '../../context/AuthContext';
import { setAuthSession } from '../../utils/session';
import ForgotPassword from '../../pages/ForgotPassword';
import ReCAPTCHA from 'react-google-recaptcha';
import PasswordInput from '../common/PasswordInput';

declare global {
  interface Window {
    google?: any;
  }
}

let gsiInitialized = false;

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode: AuthMode;
  onAdminLogin?: () => void;
  onClientLogin?: () => void;
  onWorkerLogin?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, initialMode, onAdminLogin, onClientLogin, onWorkerLogin }) => {
  const navigate = useNavigate();
  type AuthView = AuthMode | 'forgot';
  const [view, setView] = useState<AuthView>(initialMode);

  const [formData, setFormData] = useState({
  name: '',
  lastname: '',
  username: '',
  phone_number: '',
  email: '',
  password: '',
  confirmPassword: ''
});

const { login } = useAuth();
const [captchaToken, setCaptchaToken] = useState<string | null>(null);
const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;
const rawGoogleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const googleClientId = rawGoogleClientId === '463100180400-hsrvp3o9dp41g6hv7e2oecg5uv5iq'
  ? '463100180400-hsrvp3o9dp41g6hv7e2oecg5uv5iq6te.apps.googleusercontent.com'
  : rawGoogleClientId;
const enableGoogleLogin = import.meta.env.VITE_ENABLE_GOOGLE_LOGIN === 'true';
const isGoogleAuthEnabled = enableGoogleLogin && Boolean(googleClientId?.endsWith('.apps.googleusercontent.com'));
const isCaptchaEnabled = Boolean(recaptchaSiteKey);
const [isDesktop, setIsDesktop] = useState(() => {
  if (typeof window === 'undefined') return true;
  return window.innerWidth >= 768;
});

const loadGoogleGsiScript = () =>
  new Promise<void>((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-fixlife-gsi="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('GSI script failed to load')));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client?hl=en';
    script.async = true;
    script.defer = true;
    script.dataset.fixlifeGsi = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('GSI script failed to load'));
    document.head.appendChild(script);
  });

const GoogleSignInButton = ({ onCredential }: { onCredential: (credential: string) => void }) => {
  const [ready, setReady] = useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  // Keep latest callback in a ref so the effect never needs to re-run when it changes
  const onCredentialRef = useRef(onCredential);
  onCredentialRef.current = onCredential;

  useEffect(() => {
    if (!isGoogleAuthEnabled || !googleClientId) return;
    let cancelled = false;

    const setup = async () => {
      try {
        await loadGoogleGsiScript();
        if (cancelled) return;

        const google = window.google;
        if (!google?.accounts?.id || !containerRef.current) return;

        if (!gsiInitialized) {
          google.accounts.id.initialize({
            client_id: googleClientId,
            callback: (resp: any) => {
              const credential = String(resp?.credential || '');
              if (credential) onCredentialRef.current(credential);
            },
          });
          gsiInitialized = true;
        }

        containerRef.current.innerHTML = '';
        google.accounts.id.renderButton(containerRef.current, {
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'pill',
          width: 320,
          locale: 'en',
        });

        setReady(true);
      } catch (e) {
        // keep silent; fallback text below
      }
    };

    setup();
    return () => { cancelled = true; };
  }, []); // run once — callback stays current via onCredentialRef

  if (!isGoogleAuthEnabled || !googleClientId) return null;

  return (
    <div className="w-full flex justify-center">
      <div ref={containerRef} />
      {!ready && (
        <button
          type="button"
          className="flex items-center justify-center gap-3 py-2.5 rounded-lg bg-white border border-gray-200 text-gray-800 font-bold text-xs hover:bg-gray-50 transition-colors shadow-sm"
          onClick={() => {
            // no-op fallback
          }}
        >
          <span aria-hidden="true" className="text-base font-black text-bird-blue">G</span>
          Sign in with Google
        </button>
      )}
    </div>
  );
};

const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  setFormData({
    ...formData,
    [e.target.name]: e.target.value
  });
};

  useEffect(() => {
    if (isOpen) {
      setView(initialMode);
    }
  }, [initialMode, isOpen]);

  useEffect(() => {
    if (view !== 'signup') {
      setCaptchaToken(null);
    }
  }, [view]);

  useEffect(() => {
    const updateViewport = () => {
      setIsDesktop(window.innerWidth >= 768);
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);

    return () => {
      window.removeEventListener('resize', updateViewport);
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (view === 'signup') {
      void showSweetToast({ tone: 'success', message: 'Account created successfully!' });
    } else {
      void showSweetToast({ tone: 'success', message: 'Welcome back!' });
    }
    setTimeout(() => onClose(), 1500);
  };

  if (!isOpen) return null;

  const isSignup = view === 'signup';
  const toggleView = () => setView(isSignup ? 'signin' : 'signup');

  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();

  if (formData.password !== formData.confirmPassword) {
    void showSweetToast({ tone: 'error', message: 'Passwords do not match' });
    return;
  }

  if (isCaptchaEnabled && !captchaToken) {
    void showSweetToast({ tone: 'error', message: 'Please complete the captcha verification.' });
    return;
  }

  try {
    const res = await fetch(API_ENDPOINTS.auth.registerUser, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: formData.name,
        lastname: formData.lastname,
        username: formData.username,
        phone_number: formData.phone_number,
        email: formData.email,
        password: formData.password,
        ...(isCaptchaEnabled ? { captchaToken } : {}),
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      void showSweetToast({ tone: 'error', message: data.error || 'Registration failed' });
      return;
    }

    login(data.user, data.token);
    void showSweetToast({ tone: 'success', message: 'Account created successfully!' });

    setCaptchaToken(null);
    onClose();
    setTimeout(() => onClientLogin?.(), 100);
  } catch (err) {
    console.error(err);
    void showSweetToast({ tone: 'error', message: 'Connection error' });
  }
};

const handleAuthSuccess = (data: any) => {
  const role = String(data.user?.rol ?? data.user?.role ?? '').toLowerCase();

  if (role === 'admin' || role === 'root') {
    setAuthSession(data.user, data.token, 'admin');
    void showSweetToast({ tone: 'success', message: 'Admin session ready.' });
    onClose();
    setTimeout(() => {
      if (onAdminLogin) {
        onAdminLogin();
        return;
      }
      navigate('/admin-dashboard', { replace: true });
    }, 100);
    return;
  }

  if (data.user?.rol === 'worker' || data.user?.role === 'worker') {
    setAuthSession(data.user, data.token, 'worker');
    void showSweetToast({ tone: 'success', message: 'Worker session ready.' });
    onClose();
    setTimeout(() => {
      if (onWorkerLogin) {
        onWorkerLogin();
        return;
      }
      navigate('/pro-dashboard', { replace: true });
    }, 100);
    return;
  }

  login(data.user, data.token);
  void showSweetToast({ tone: 'success', message: 'Welcome back!' });
  onClose();
  setTimeout(() => onClientLogin?.(), 100);
};

const handleGoogleSignin = async (credential: string) => {
  try {
    const res = await fetch(API_ENDPOINTS.auth.google, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    });

    const data = await res.json();

    if (!res.ok) {
      void showSweetToast({ tone: 'error', message: data.error || 'Google login failed' });
      return;
    }

    handleAuthSuccess(data);
  } catch (err) {
    console.error(err);
    void showSweetToast({ tone: 'error', message: 'Connection error' });
  }
};

const handleSignin = async (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();

  if (!formData.email || !formData.password) {
  void showSweetToast({ tone: 'error', message: 'Email and password are required' });
  return;
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(formData.email)) {
  void showSweetToast({ tone: 'error', message: 'Invalid email format' });
  return;
}

  try {
    const res = await fetch(API_ENDPOINTS.auth.login, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: formData.email,
        password: formData.password,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      void showSweetToast({ tone: 'error', message: data.error || 'Login failed' });
      return;
    }

    handleAuthSuccess(data);
  } catch (err) {
    console.error(err);
    void showSweetToast({ tone: 'error', message: 'Connection error' });
  }
};

  const transitionClass = "transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]";

  if (view === 'forgot') {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={onClose}
      />

      <div className="relative bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md animate-zoom-in">
        <ForgotPassword onBack={() => setView('signin')} />
      </div>
    </div>
  );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {isDesktop ? (
        <div className="relative z-[101] w-full max-w-[850px] h-[520px] bg-white rounded-3xl shadow-2xl overflow-hidden text-gray-900 ring-1 ring-gray-200 animate-zoom-in">
          <div
            className={`absolute top-0 bottom-0 left-0 w-1/2 bg-gradient-to-br from-bird-blue to-bird-darkBlue z-20 ${transitionClass}`}
            style={{
              transform: isSignup ? 'translateX(0%)' : 'translateX(100%)',
            }}
          >
            <div className="absolute top-[-20%] -left-[20%] w-60 h-60 bg-white/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-[-20%] -right-[20%] w-60 h-60 bg-bird-yellow/20 rounded-full blur-3xl pointer-events-none" />
          </div>

          <div
            className={`absolute top-0 left-0 w-1/2 h-full z-30 flex flex-col items-center justify-center text-center px-12 gap-6 ${transitionClass}
             ${isSignup ? 'translate-x-0 opacity-100 pointer-events-auto' : '-translate-x-[20%] opacity-0 pointer-events-none'}`}
          >
            <h2 className="text-4xl font-bold tracking-tight text-white">Welcome Back!</h2>
            <p className="text-sm text-blue-100/80 leading-relaxed">
              To keep connected with us please login with your personal info
            </p>
            <button onClick={toggleView} className="mt-2 px-10 py-3 rounded-full border border-white/40 bg-white/10 text-white font-semibold hover:bg-white hover:text-bird-blue transition-all duration-300 backdrop-blur-sm">
              SIGN IN
            </button>
          </div>

          <div
            className={`absolute top-0 left-1/2 w-1/2 h-full z-10 flex flex-col items-center justify-center px-10 ${transitionClass}
             ${isSignup ? 'translate-x-0 opacity-100 z-10' : 'translate-x-[20%] opacity-0 z-0'}`}
          >
            <h2 className="text-3xl font-bold mb-4 text-bird-blue">Create Account</h2>
            <p className="text-xs text-gray-500 mb-4">or use your email for registration</p>
            <form className="w-full flex flex-col gap-2.5" onSubmit={handleSignup}>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-gray-50 rounded-lg p-1 border border-gray-200 focus-within:border-bird-blue/50 transition-colors">
                  <input type="text" name="name" maxLength={50} value={formData.name} onChange={handleChange} placeholder="First Name" className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 outline-none placeholder-gray-500" />
                </div>
                <div className="bg-gray-50 rounded-lg p-1 border border-gray-200 focus-within:border-bird-blue/50 transition-colors">
                  <input type="text" name="lastname" maxLength={50} value={formData.lastname} onChange={handleChange} placeholder="Last Name" className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 outline-none placeholder-gray-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-gray-50 rounded-lg p-1 border border-gray-200 focus-within:border-bird-blue/50 transition-colors">
                  <input type="text" name="username" maxLength={30} value={formData.username} onChange={handleChange} placeholder="Username" className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 outline-none placeholder-gray-500" />
                </div>
                <div className="bg-gray-50 rounded-lg p-1 border border-gray-200 focus-within:border-bird-blue/50 transition-colors">
                  <input type="tel" name="phone_number" maxLength={15} value={formData.phone_number} onChange={handleChange} placeholder="Phone" className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 outline-none placeholder-gray-500" />
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-1 border border-gray-200 focus-within:border-bird-blue/50 transition-colors">
                <input type="email" name="email" maxLength={100} value={formData.email} onChange={handleChange} placeholder="Email" className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 outline-none placeholder-gray-500" />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-gray-50 rounded-lg p-1 border border-gray-200 focus-within:border-bird-blue/50 transition-colors">
                  <PasswordInput maxLength={128}  name="password" value={formData.password} onChange={handleChange} placeholder="Password" className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 outline-none placeholder-gray-500" />
                </div>
                <div className="bg-gray-50 rounded-lg p-1 border border-gray-200 focus-within:border-bird-blue/50 transition-colors">
                  <PasswordInput maxLength={128}  name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} placeholder="Confirm" className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 outline-none placeholder-gray-500" />
                </div>
              </div>

              {isCaptchaEnabled && (
                <div className="flex justify-center pt-1">
                  <ReCAPTCHA
                    sitekey={recaptchaSiteKey!}
                    hl="en"
                    onChange={(value) => setCaptchaToken(value || null)}
                  />
                </div>
              )}

              <button className="mt-2 w-full py-3 rounded-full bg-bird-yellow text-gray-900 font-bold text-sm tracking-wide shadow-lg shadow-bird-yellow/20 hover:bg-bird-orange hover:scale-[1.02] transition-all duration-300">
                SIGN UP
              </button>
            </form>
          </div>

          <div
            className={`absolute top-0 left-1/2 w-1/2 h-full z-30 flex flex-col items-center justify-center text-center px-12 gap-6 ${transitionClass}
             ${!isSignup ? 'translate-x-0 opacity-100 pointer-events-auto' : 'translate-x-[20%] opacity-0 pointer-events-none'}`}
          >
            <h2 className="text-4xl font-bold tracking-tight text-white">Hello, Friend!</h2>
            <p className="text-sm text-blue-100/80 leading-relaxed">
              Enter your personal details and start your journey with us
            </p>
            <button onClick={toggleView} className="mt-2 px-10 py-3 rounded-full border border-white/40 bg-white/10 text-white font-semibold hover:bg-white hover:text-bird-blue transition-all duration-300 backdrop-blur-sm">
              SIGN UP
            </button>
          </div>

          <div
            className={`absolute top-0 left-0 w-1/2 h-full z-10 flex flex-col items-center justify-center px-14 ${transitionClass}
             ${!isSignup ? 'translate-x-0 opacity-100 z-10' : '-translate-x-[20%] opacity-0 z-0'}`}
          >
            <h2 className="text-3xl font-bold mb-6 text-bird-blue">Sign in to Fixlife</h2>
            <div className="flex flex-col gap-3 w-full mb-6">
              <GoogleSignInButton onCredential={handleGoogleSignin} />
            </div>

            <p className="text-xs text-gray-500 mb-4">or use your email account</p>
            <form className="w-full flex flex-col gap-3" onSubmit={handleSignin}>
              <div className="bg-gray-50 rounded-lg p-1 border border-gray-200 focus-within:border-bird-blue/50 transition-colors">
                <input type="email" name="email" maxLength={100} value={formData.email} onChange={handleChange} placeholder="Email" className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 outline-none placeholder-gray-500" />
              </div>
              <div className="bg-gray-50 rounded-lg p-1 border border-gray-200 focus-within:border-bird-blue/50 transition-colors">
                <PasswordInput maxLength={128}  name="password" value={formData.password} onChange={handleChange} placeholder="Password" className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 outline-none placeholder-gray-500" />
              </div>
              <button type="button" onClick={() => setView('forgot')} className="text-xs text-gray-500 hover:text-bird-blue transition-colors self-end my-1"> Forgot your password? </button>
              <button className="w-full py-3.5 rounded-full bg-bird-blue text-white font-bold text-sm tracking-wide shadow-lg shadow-bird-blue/20 hover:bg-bird-darkBlue hover:scale-[1.02] transition-all duration-300">
                SIGN IN
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="relative z-[101] w-full max-w-[380px] bg-white/95 backdrop-blur-xl border border-gray-200 rounded-3xl shadow-2xl overflow-hidden flex flex-col min-h-[600px] animate-zoom-in">
          <div className="absolute inset-0 pointer-events-none">
            <div className={`absolute top-[-20%] left-[-20%] w-[300px] h-[300px] rounded-full blur-[80px] transition-all duration-700 ${isSignup ? 'bg-bird-yellow/20 translate-x-[50%]' : 'bg-bird-blue/20 translate-x-0'}`} />
            <div className={`absolute bottom-[-10%] right-[-10%] w-[250px] h-[250px] rounded-full blur-[60px] transition-all duration-700 ${isSignup ? 'bg-bird-orange/10' : 'bg-bird-darkBlue/20'}`} />
          </div>

          <div className="relative z-10 flex flex-col h-full p-6 overflow-y-auto custom-scrollbar">
            <div className="w-full h-12 bg-gray-100 rounded-full p-1 flex relative mb-6 shrink-0 backdrop-blur-sm border border-gray-200">
              <div className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full shadow-lg transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${isSignup ? 'left-[50%] bg-bird-yellow' : 'left-1 bg-bird-blue'}`} />
              <button onClick={() => setView('signin')} className={`flex-1 relative z-10 text-xs font-bold tracking-wide transition-colors duration-300 flex items-center justify-center ${!isSignup ? 'text-white' : 'text-gray-600 hover:text-gray-900'}`}>
                SIGN IN
              </button>
              <button onClick={() => setView('signup')} className={`flex-1 relative z-10 text-xs font-bold tracking-wide transition-colors duration-300 flex items-center justify-center ${isSignup ? 'text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}>
                SIGN UP
              </button>
            </div>

            <div className="flex-1 flex flex-col justify-center transition-all duration-500">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  {isSignup ? 'Create Account' : 'Welcome Back'}
                </h2>
                <p className="text-xs text-gray-600 px-4">
                  {isSignup ? 'Sign up to get started.' : 'Enter your credentials to access.'}
                </p>
              </div>

              {!isSignup && (
                <div className="flex flex-col gap-3 mb-6">
                  <GoogleSignInButton onCredential={handleGoogleSignin} />
                </div>
              )}

              <div className="relative flex py-2 items-center mb-6">
                <div className="flex-grow border-t border-gray-200"></div>
                <span className="flex-shrink-0 mx-4 text-xs text-gray-500">Or continue with email</span>
                <div className="flex-grow border-t border-gray-200"></div>
              </div>

              <form className="flex flex-col gap-3" onSubmit={isSignup ? handleSignup : handleSignin}>
                {isSignup && (
                  <div className="animate-fade-in-up space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-200 focus-within:border-bird-blue/50 transition-colors">
                        <input type="text" name="name" maxLength={50} value={formData.name} onChange={handleChange} placeholder="Name" className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder-gray-500" />
                      </div>
                      <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-200 focus-within:border-bird-blue/50 transition-colors">
                        <input type="text" name="lastname" maxLength={50} value={formData.lastname} onChange={handleChange} placeholder="Surname" className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder-gray-500" />
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-200 focus-within:border-bird-blue/50 transition-colors">
                      <input type="text" name="username" maxLength={30} value={formData.username} onChange={handleChange} placeholder="Username" className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder-gray-500" />
                    </div>
                    <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-200 focus-within:border-bird-blue/50 transition-colors">
                      <input type="tel" name="phone_number" maxLength={15} value={formData.phone_number} onChange={handleChange} placeholder="Phone Number" className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder-gray-500" />
                    </div>
                  </div>
                )}

                <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-200 focus-within:border-bird-blue/50 transition-colors">
                  <input type="email" name="email" maxLength={100} value={formData.email} onChange={handleChange} placeholder="Email Address" className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder-gray-500" />
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-200 focus-within:border-bird-blue/50 transition-colors">
                    <PasswordInput maxLength={128}  name="password" value={formData.password} onChange={handleChange} placeholder="Password" className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder-gray-500" />
                  </div>
                  {isSignup && (
                    <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-200 focus-within:border-bird-blue/50 transition-colors animate-fade-in-up">
                      <PasswordInput maxLength={128}  name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} placeholder="Confirm Password" className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder-gray-500" />
                    </div>
                  )}
                </div>

                {isSignup && isCaptchaEnabled && (
                  <div className="flex justify-center pt-2">
                    <ReCAPTCHA
                      sitekey={recaptchaSiteKey!}
                      hl="en"
                      onChange={(value) => setCaptchaToken(value || null)}
                    />
                  </div>
                )}

                {!isSignup && (
                  <div className="flex justify-end">
                    <button type="button" onClick={() => setView('forgot')} className="text-xs text-gray-500 hover:text-bird-blue transition-colors self-end my-1"> Forgot your password?</button>
                  </div>
                )}

                <button className={`mt-4 w-full py-4 rounded-xl font-bold text-sm tracking-wide shadow-lg active:scale-[0.98] transition-all duration-300 ${isSignup ? 'bg-gradient-to-r from-bird-yellow to-bird-orange text-gray-900 shadow-bird-yellow/20' : 'bg-gradient-to-r from-bird-blue to-bird-darkBlue text-white shadow-bird-blue/20'}`}>
                  {isSignup ? 'Create Account' : 'Sign In'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
