import React, { useState, useEffect } from 'react';
import { API_ENDPOINTS, API_URL } from '../../config/api';
import { Notyf } from 'notyf';
import 'notyf/notyf.min.css';
import { motion, AnimatePresence } from 'framer-motion';
import WorkerForgotPassword from '../../pages/WorkerForgotPassword';
import { getAuthUser, getToken, setAuthSession, updateStoredAuthUser } from '../../utils/session';

interface ServiceOption {
  id_service: number;
  name: string;
  description: string | null;
  icon: string | null;
}

interface WorkerAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'signin' | 'signup';
  onSuccess?: () => void;
}

export const WorkerAuthModal: React.FC<WorkerAuthModalProps> = ({ isOpen, onClose, mode: initialMode, onSuccess }) => {
  const [view, setView] = useState<'signin' | 'signup' | 'specialties' | 'verify' | 'upload' | 'forgot'>(initialMode);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [availableServices, setAvailableServices] = useState<ServiceOption[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);

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
  const [duiFile, setDuiFile] = useState<File | null>(null);
  const [certFile, setCertFile] = useState<File | null>(null);
  const [resendTimer, setResendTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setView(initialMode);
      setError('');
      setOtp('');
      setRegisteredEmail('');
      setSelectedServiceIds([]);
      // Fetch available services
      fetch(API_ENDPOINTS.services.getActive)
        .then(r => r.json())
        .then(data => { if (data.success) setAvailableServices(data.services); })
        .catch(() => {});
    }
  }, [initialMode, isOpen]);

  // Resend countdown timer
  useEffect(() => {
    if (view !== 'verify') return;
    setResendTimer(60);
    setCanResend(false);
    const interval = setInterval(() => {
      setResendTimer(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [view]);

  if (!isOpen) return null;

  const isSignup = view === 'signup' || view === 'specialties' || view === 'verify' || view === 'upload';
  const toggleView = () => {
    setView(isSignup ? 'signin' : 'signup');
    setError('');
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (formData.password !== formData.confirmPassword) {
      notyf.error('Passwords do not match');
      setLoading(false);
      return;
    }

    const nameRegex = /^[a-zA-Z\s]+$/;
    const phoneRegex = /^[+\d\-\s]+$/;
    const usernameRegex = /^[a-zA-Z0-9_]+$/;

    if (!nameRegex.test(formData.name.trim()) || formData.name.trim().length > 50) {
      notyf.error('First name is invalid or too long (max 50 chars, letters only)');
      setLoading(false);
      return;
    }

    if (!nameRegex.test(formData.lastname.trim()) || formData.lastname.trim().length > 50) {
      notyf.error('Last name is invalid or too long (max 50 chars, letters only)');
      setLoading(false);
      return;
    }

    if (formData.username && (!usernameRegex.test(formData.username.trim()) || formData.username.trim().length > 30)) {
      notyf.error('Username is invalid or too long (max 30 chars, alphanumeric and underscores only)');
      setLoading(false);
      return;
    }

    if (!phoneRegex.test(formData.phone_number.trim()) || formData.phone_number.trim().length > 15) {
      notyf.error('Phone number is invalid or too long (max 15 chars)');
      setLoading(false);
      return;
    }
    
    if (formData.email.trim().length > 100) {
      notyf.error('Email is too long (max 100 chars)');
      setLoading(false);
      return;
    }

    if (formData.password.length < 8 || formData.password.length > 128) {
      notyf.error('Password must be between 8 and 128 characters');
      setLoading(false);
      return;
    }

    try {
      // Client-side validation passed — move to specialties selection
      setRegisteredEmail(formData.email);
      setLoading(false);
      setView('specialties');
    } catch (err) {
      console.error('[WorkerAuthModal] Error:', err);
      notyf.error('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSpecialtiesSubmit = async () => {
    setError('');
    setLoading(true);

    try {
      const response = await fetch(API_ENDPOINTS.auth.registerWorker, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          lastname: formData.lastname,
          email: formData.email,
          phone_number: formData.phone_number,
          password: formData.password,
          username: formData.username || undefined,
          service_ids: selectedServiceIds,
        })
      });

      const data = await response.json();

      if (!response.ok) {
        notyf.error(data.error || 'Registration failed');
        setLoading(false);
        return;
      }

      setRegisteredEmail(formData.email);
      notyf.success('OTP sent to your email!');
      setView('verify');
    } catch (err) {
      console.error('[WorkerAuthModal] Error:', err);
      notyf.error('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (otp.length !== 6) {
      notyf.error('Please enter a valid 6-digit OTP code');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(API_ENDPOINTS.auth.verifyWorkerEmail, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: registeredEmail,
          otp: otp
        })
      });

      const data = await response.json();

      if (!response.ok) {
        notyf.error(data.error || 'Verification failed');
        setLoading(false);
        return;
      }

      setAuthSession(data.user, data.token, 'worker');
      notyf.success('Email verified! Pro account created.');
      setView('upload');
    } catch (err) {
      console.error('[WorkerAuthModal] Error verifying:', err);
      notyf.error('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSigninSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
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

      const isWorker = data.user?.rol === 'worker' || data.user?.pending_worker === 1 || data.user?.pending_worker === true;
      if (!isWorker) {
        notyf.error('This account is not registered as a worker');
        setLoading(false);
        return;
      }

      setAuthSession(data.user, data.token, 'worker');
      notyf.success('Welcome back, Pro!');
      onClose();
      setTimeout(() => {
        onSuccess?.();
      }, 100);
    } catch (err) {
      console.error('[WorkerAuthModal] Error:', err);
      notyf.error('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleFinishUpload = () => {
    onClose();
    setTimeout(() => {
      onSuccess?.();
    }, 100);
  };

  const handleUploadDocuments = async () => {
    if (!duiFile) {
      notyf.error('Please select your ID document (DUI)');
      return;
    }

    if (!certFile) {
      notyf.error('Please select your certification document');
      return;
    }

    const MAX_SIZE = 10 * 1024 * 1024;
    if (duiFile.size > MAX_SIZE) {
      notyf.error('The ID file is too large. Max size is 10MB.');
      return;
    }
    if (certFile && certFile.size > MAX_SIZE) {
      notyf.error('The certification file is too large. Max size is 10MB.');
      return;
    }

    setLoading(true);
    const token = getToken('worker');

    const formData = new FormData();
    formData.append('dui_document', duiFile);
    if (certFile) formData.append('cert_document', certFile);

    try {
      const response = await fetch(`${API_URL}/api/worker/verify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        notyf.error(data.error || 'Error uploading documents');
        setLoading(false);
        return;
      }

      // Update localStorage
      const userObj = getAuthUser('worker');
      if (userObj) {
          if (!userObj.worker_profile) userObj.worker_profile = {};
          userObj.worker_profile.dui_document = data.dui_path;
          userObj.worker_profile.cert_document = data.cert_path;
          updateStoredAuthUser(userObj, 'worker');
      }

      notyf.success('Documents uploaded! Pending admin review.');
      handleFinishUpload();
    } catch (err) {
      console.error('[WorkerAuthModal] Upload error:', err);
      notyf.error('Connection error. Please try again.');
    } finally {
      setLoading(false);
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
          <WorkerForgotPassword onBack={() => setView('signin')} />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md animate-fade-in-up"
        style={{ animationDuration: '0.4s' }}
        onClick={view === 'verify' || view === 'upload' || view === 'specialties' ? undefined : onClose}
      />

      {/* DESKTOP VERSION */}
      <div className="hidden md:flex relative w-full max-w-[850px] h-[580px] bg-white rounded-3xl shadow-2xl overflow-hidden text-gray-900 ring-1 ring-gray-200 animate-zoom-in">

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
           ${isSignup && view !== 'upload' ? 'translate-x-0 opacity-100 pointer-events-auto' : '-translate-x-[20%] opacity-0 pointer-events-none'}`}
        >
          <h2 className="text-4xl font-bold tracking-tight text-white">Welcome Back Pro!</h2>
          <p className="text-sm text-white/90 leading-relaxed">
             Access your professional dashboard to manage your services and connect with clients.
          </p>
          {view === 'signup' && (
            <button onClick={toggleView} className="mt-2 px-10 py-3 rounded-full border border-white/50 bg-white/10 text-white font-bold hover:bg-white hover:text-bird-orange transition-all duration-300 backdrop-blur-sm shadow-lg">
              SIGN IN
            </button>
          )}
        </div>

        <div
          className={`absolute top-0 left-1/2 w-1/2 h-full z-10 flex flex-col items-center justify-center px-10 ${transitionClass}
           ${isSignup ? 'translate-x-0 opacity-100 z-10' : 'translate-x-[20%] opacity-0 z-0'}`}
        >
          <AnimatePresence mode="wait">
            {view === 'signup' && (
              <motion.div 
                key="signup-form"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="w-full"
              >
                <div className="flex flex-col items-center text-center w-full">
                  <h2 className="text-3xl font-bold mb-2 text-bird-orange">Join as a Pro</h2>
                  <p className="text-xs text-gray-500 mb-4">Start earning by offering your services</p>

                  <form className="w-full flex flex-col gap-2.5" onSubmit={handleSignupSubmit}>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="bg-gray-50 rounded-lg p-1 border border-gray-200 focus-within:border-bird-orange/50 transition-colors">
                        <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} type="text" maxLength={50} placeholder="First Name" className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 outline-none placeholder-gray-500" />
                      </div>
                      <div className="bg-gray-50 rounded-lg p-1 border border-gray-200 focus-within:border-bird-orange/50 transition-colors">
                        <input required value={formData.lastname} onChange={e => setFormData({...formData, lastname: e.target.value})} type="text" maxLength={50} placeholder="Last Name" className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 outline-none placeholder-gray-500" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="bg-gray-50 rounded-lg p-1 border border-gray-200 focus-within:border-bird-orange/50 transition-colors">
                        <input value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} type="text" maxLength={30} placeholder="Username (Optional)" className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 outline-none placeholder-gray-500" />
                      </div>
                      <div className="bg-gray-50 rounded-lg p-1 border border-gray-200 focus-within:border-bird-orange/50 transition-colors">
                        <input required value={formData.phone_number} onChange={e => setFormData({...formData, phone_number: e.target.value})} type="tel" maxLength={15} placeholder="Phone Number" className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 outline-none placeholder-gray-500" />
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-1 border border-gray-200 focus-within:border-bird-orange/50 transition-colors">
                      <input required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} type="email" maxLength={100} placeholder="Email Address" className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 outline-none placeholder-gray-500" />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="bg-gray-50 rounded-lg p-1 border border-gray-200 focus-within:border-bird-orange/50 transition-colors">
                        <input required value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} type="password" maxLength={128} placeholder="Password" className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 outline-none placeholder-gray-500" />
                      </div>
                      <div className="bg-gray-50 rounded-lg p-1 border border-gray-200 focus-within:border-bird-orange/50 transition-colors">
                        <input required value={formData.confirmPassword} onChange={e => setFormData({...formData, confirmPassword: e.target.value})} type="password" maxLength={128} placeholder="Confirm Password" className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 outline-none placeholder-gray-500" />
                      </div>
                    </div>

                    <button disabled={loading} type="submit" className="mt-2 w-full py-3 rounded-full bg-gradient-to-r from-bird-orange to-bird-gold text-white font-bold text-sm tracking-wide shadow-lg shadow-bird-orange/20 hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed">
                      {loading ? 'PROCESSING...' : 'CREATE PRO ACCOUNT'}
                    </button>
                  </form>
                </div>
              </motion.div>
            )}

            {view === 'specialties' && (
              <motion.div
                key="specialties-form"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="w-full flex flex-col items-center text-center"
              >
                <div className="w-16 h-16 bg-bird-gold/10 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-bird-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                </div>
                <h2 className="text-3xl font-bold mb-2 text-bird-orange">Your Specialties</h2>
                <p className="text-sm text-gray-600 mb-5">Select the services you specialize in</p>

                <div className="w-full grid grid-cols-2 gap-2 max-h-[220px] overflow-y-auto custom-scrollbar mb-4 px-1">
                  {availableServices.length === 0 ? (
                    <p className="col-span-2 text-sm text-gray-400 py-4">No services available yet.</p>
                  ) : availableServices.map(svc => {
                    const isSelected = selectedServiceIds.includes(svc.id_service);
                    return (
                      <button
                        key={svc.id_service}
                        type="button"
                        onClick={() => setSelectedServiceIds(prev =>
                          isSelected ? prev.filter(id => id !== svc.id_service) : [...prev, svc.id_service]
                        )}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all duration-200 ${
                          isSelected
                            ? 'bg-bird-orange/10 border-bird-orange text-bird-orange shadow-sm'
                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        <span className="text-base">{svc.icon && svc.icon.length <= 2 ? svc.icon : '⚙️'}</span>
                        <span className="truncate">{svc.name}</span>
                        {isSelected && (
                          <svg className="w-4 h-4 ml-auto text-bird-orange shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>

                <button
                  disabled={loading}
                  onClick={handleSpecialtiesSubmit}
                  className="w-full py-4 rounded-full bg-gradient-to-r from-bird-orange to-bird-gold text-white font-bold text-sm tracking-wide shadow-lg shadow-bird-orange/20 hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'CREATING ACCOUNT...' : 'CONTINUE'}
                </button>
                <button onClick={() => setView('signup')} className="mt-3 text-sm text-gray-500 hover:text-gray-700 font-semibold transition-colors">
                  ← Go Back
                </button>
              </motion.div>
            )}

            {view === 'verify' && (
              <motion.div 
                key="verify-form"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="w-full flex flex-col items-center text-center"
              >
                <div className="w-16 h-16 bg-bird-orange/10 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-bird-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2 className="text-3xl font-bold mb-2 text-bird-orange">Check your email</h2>
                <p className="text-sm text-gray-600 mb-6">
                  We've sent a 6-digit verification code to <br/><span className="font-semibold text-gray-900">{registeredEmail}</span>
                </p>

                <form className="w-full flex flex-col gap-4 max-w-[280px]" onSubmit={handleVerifySubmit}>
                  <div className="bg-gray-50 rounded-lg p-1 border border-gray-200 focus-within:border-bird-orange/50 transition-colors">
                    <input 
                      required 
                      value={otp} 
                      onChange={e => setOtp(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} 
                      type="text" 
                      placeholder="Enter 6-digit code" 
                      className="w-full bg-transparent px-3 py-3 text-center text-xl tracking-[0.5em] font-bold text-gray-900 outline-none placeholder-gray-400" 
                    />
                  </div>
                  <button disabled={loading || otp.length !== 6} type="submit" className="w-full py-4 rounded-full bg-gradient-to-r from-bird-orange to-bird-gold text-white font-bold text-sm tracking-wide shadow-lg shadow-bird-orange/20 hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed">
                    {loading ? 'VERIFYING...' : 'VERIFY EMAIL'}
                  </button>
                </form>

                <div className="flex items-center gap-4 mt-4">
                  <button onClick={() => { setView('signup'); setOtp(''); }} className="text-sm text-gray-500 hover:text-gray-700 font-semibold transition-colors">
                    ← Go Back
                  </button>
                  <button 
                    disabled={!canResend || loading} 
                    onClick={async () => {
                      try {
                        setCanResend(false);
                        setResendTimer(60);
                        const res = await fetch(API_ENDPOINTS.auth.resendOtp, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ email: registeredEmail })
                        });
                        const data = await res.json();
                        if (res.ok) {
                          notyf.success('New code sent!');
                        } else {
                          notyf.error(data.error || 'Failed to resend');
                        }
                      } catch {
                        notyf.error('Connection error');
                      }
                    }}
                    className="text-sm font-semibold transition-colors disabled:text-gray-400 text-bird-orange hover:text-bird-orange/80 disabled:cursor-not-allowed"
                  >
                    {canResend ? 'Resend Code' : `Resend in ${resendTimer}s`}
                  </button>
                </div>
              </motion.div>
            )}

            {view === 'upload' && (
              <motion.div 
                key="upload-form"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="w-full flex flex-col items-center text-center"
              >
                <div className="w-16 h-16 bg-bird-gold/10 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-bird-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h2 className="text-3xl font-bold mb-2 text-gray-900">Upload Documents</h2>
                <p className="text-sm text-gray-600 mb-4 px-4">
                  Upload your ID (DUI) to get verified by our team.
                </p>

                <label className="w-full border-2 border-dashed border-gray-300 rounded-2xl p-6 mb-3 bg-gray-50 flex flex-col items-center justify-center hover:bg-gray-100 transition-colors cursor-pointer group">
                  <svg className="w-10 h-10 text-gray-400 group-hover:text-bird-orange transition-colors mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <span className="text-sm font-semibold text-gray-700">{duiFile ? duiFile.name : 'ID Document (Required)'}</span>
                  <span className="text-xs text-gray-500 mt-1">PDF, JPG, PNG (Max 10MB)</span>
                  <input type="file" className="hidden" accept="image/*,.pdf" onChange={(e) => setDuiFile(e.target.files?.[0] || null)} />
                </label>

                <label className="w-full border-2 border-dashed border-gray-200 rounded-2xl p-4 mb-4 bg-gray-50 flex flex-col items-center justify-center hover:bg-gray-100 transition-colors cursor-pointer">
                  <span className="text-sm font-semibold text-gray-600">{certFile ? certFile.name : 'Certifications (Required)'}</span>
                  <input type="file" className="hidden" accept="image/*,.pdf" onChange={(e) => setCertFile(e.target.files?.[0] || null)} />
                </label>

                <div className="w-full flex gap-3">
                  <button onClick={handleFinishUpload} className="flex-1 py-3 rounded-full border border-gray-200 text-gray-600 font-bold text-sm tracking-wide hover:bg-gray-50 transition-all duration-300">
                    SKIP FOR NOW
                  </button>
                  <button disabled={loading || !duiFile || !certFile} onClick={handleUploadDocuments} className="flex-1 py-3 rounded-full bg-gradient-to-r from-bird-orange to-bird-gold text-white font-bold text-sm tracking-wide shadow-lg shadow-bird-orange/20 hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed">
                    {loading ? 'UPLOADING...' : 'UPLOAD FILES'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
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

          <form className="w-full flex flex-col gap-4" onSubmit={handleSigninSubmit}>
            <div className="bg-gray-50 rounded-lg p-1 border border-gray-200 focus-within:border-bird-orange/50 transition-colors">
              <input required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} type="email" maxLength={100} placeholder="Email Address" className="w-full bg-transparent px-3 py-3 text-sm text-gray-900 outline-none placeholder-gray-500" />
            </div>
            <div className="bg-gray-50 rounded-lg p-1 border border-gray-200 focus-within:border-bird-orange/50 transition-colors">
              <input required value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} type="password" maxLength={128} placeholder="Password" className="w-full bg-transparent px-3 py-3 text-sm text-gray-900 outline-none placeholder-gray-500" />
            </div>
            
            <button
              type="button"
              onClick={() => setView('forgot')}
              className="text-xs text-gray-500 hover:text-bird-orange transition-colors self-end my-1"
            >
              Forgot your password?
            </button>
            
            <button disabled={loading} type="submit" className="w-full py-4 rounded-full bg-gradient-to-r from-bird-orange to-bird-gold text-white font-bold text-sm tracking-wide shadow-lg shadow-bird-orange/20 hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? 'PROCESSING...' : 'SIGN IN'}
            </button>
          </form>
        </div>
      </div>

      {/* MOBILE VERSION REDACTED FOR BREVITY - FULL IMPLEMENTATION SHOULD KEEP MOBILE TOO, adding it below */}
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

          {(view === 'signin' || view === 'signup') && (
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
          )}

          <div className="flex-1 flex flex-col justify-center transition-all duration-500">
            <AnimatePresence mode="wait">
              {view === 'signup' && (
                <motion.div 
                  key="mobile-signup"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  className="flex flex-col gap-3"
                >
                  <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Join as a Pro</h2>
                    <p className="text-xs text-gray-600 px-4">Start earning by offering your services.</p>
                  </div>
                  <form className="flex flex-col gap-3" onSubmit={handleSignupSubmit}>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white rounded-xl px-4 py-3 border border-gray-200 focus-within:border-bird-orange/50 transition-colors shadow-sm">
                        <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} type="text" maxLength={50} placeholder="First Name" className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder-gray-500" />
                      </div>
                      <div className="bg-white rounded-xl px-4 py-3 border border-gray-200 focus-within:border-bird-orange/50 transition-colors shadow-sm">
                        <input required value={formData.lastname} onChange={e => setFormData({...formData, lastname: e.target.value})} type="text" maxLength={50} placeholder="Last Name" className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder-gray-500" />
                      </div>
                    </div>
                    <div className="bg-white rounded-xl px-4 py-3 border border-gray-200 focus-within:border-bird-orange/50 transition-colors shadow-sm">
                      <input value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} type="text" maxLength={30} placeholder="Username (Optional)" className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder-gray-500" />
                    </div>
                    <div className="bg-white rounded-xl px-4 py-3 border border-gray-200 focus-within:border-bird-orange/50 transition-colors shadow-sm">
                      <input required value={formData.phone_number} onChange={e => setFormData({...formData, phone_number: e.target.value})} type="tel" maxLength={15} placeholder="Phone Number" className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder-gray-500" />
                    </div>
                    <div className="bg-white rounded-xl px-4 py-3 border border-gray-200 focus-within:border-bird-orange/50 transition-colors shadow-sm">
                      <input required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} type="email" maxLength={100} placeholder="Email Address" className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder-gray-500" />
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      <div className="bg-white rounded-xl px-4 py-3 border border-gray-200 focus-within:border-bird-orange/50 transition-colors shadow-sm">
                        <input required value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} type="password" maxLength={128} placeholder="Password" className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder-gray-500" />
                      </div>
                      <div className="bg-white rounded-xl px-4 py-3 border border-gray-200 focus-within:border-bird-orange/50 transition-colors shadow-sm animate-fade-in-up">
                        <input required value={formData.confirmPassword} onChange={e => setFormData({...formData, confirmPassword: e.target.value})} type="password" maxLength={128} placeholder="Confirm Password" className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder-gray-500" />
                      </div>
                    </div>
                    <button disabled={loading} type="submit" className="mt-4 w-full py-4 rounded-xl font-bold text-sm tracking-wide shadow-lg active:scale-[0.98] transition-all duration-300 bg-gradient-to-r from-bird-yellow to-bird-gold text-gray-900 shadow-bird-yellow/20 disabled:opacity-50 disabled:cursor-not-allowed">
                      {loading ? 'PROCESSING...' : "Create Pro Account"}
                    </button>
                  </form>
                </motion.div>
              )}

              {view === 'specialties' && (
                <motion.div
                  key="mobile-specialties"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  className="flex flex-col items-center justify-center text-center h-full"
                >
                  <div className="w-16 h-16 bg-bird-gold/10 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-bird-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-1">Your Specialties</h2>
                  <p className="text-sm text-gray-600 mb-5 px-2">Select the services you specialize in</p>

                  <div className="w-full grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto custom-scrollbar mb-4">
                    {availableServices.length === 0 ? (
                      <p className="col-span-2 text-sm text-gray-400 py-4">No services available yet.</p>
                    ) : availableServices.map(svc => {
                      const isSelected = selectedServiceIds.includes(svc.id_service);
                      return (
                        <button
                          key={svc.id_service}
                          type="button"
                          onClick={() => setSelectedServiceIds(prev =>
                            isSelected ? prev.filter(id => id !== svc.id_service) : [...prev, svc.id_service]
                          )}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all duration-200 ${
                            isSelected
                              ? 'bg-bird-orange/10 border-bird-orange text-bird-orange shadow-sm'
                              : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          <span className="text-base">{svc.icon && svc.icon.length <= 2 ? svc.icon : '⚙️'}</span>
                          <span className="truncate">{svc.name}</span>
                          {isSelected && (
                            <svg className="w-4 h-4 ml-auto text-bird-orange shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    disabled={loading}
                    onClick={handleSpecialtiesSubmit}
                    className="w-full py-4 rounded-xl font-bold text-sm tracking-wide shadow-lg active:scale-[0.98] transition-all duration-300 bg-gradient-to-r from-bird-orange to-bird-gold text-white shadow-bird-orange/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'CREATING ACCOUNT...' : 'Continue'}
                  </button>
                  <button onClick={() => setView('signup')} className="mt-3 text-sm text-gray-500 hover:text-gray-700 font-semibold transition-colors">
                    ← Go Back
                  </button>
                </motion.div>
              )}

              {view === 'verify' && (
                <motion.div 
                  key="mobile-verify"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  className="flex flex-col items-center justify-center text-center h-full"
                >
                  <div className="w-16 h-16 bg-bird-orange/10 rounded-full flex items-center justify-center mb-6">
                    <svg className="w-8 h-8 text-bird-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Check Email</h2>
                  <p className="text-sm text-gray-600 mb-8">
                    OTP sent to <span className="font-semibold text-gray-900">{registeredEmail}</span>
                  </p>
                  <form className="w-full" onSubmit={handleVerifySubmit}>
                    <div className="bg-white rounded-xl px-4 py-3 border border-gray-200 focus-within:border-bird-orange/50 transition-colors shadow-sm mb-6">
                      <input 
                        required 
                        value={otp} 
                        onChange={e => setOtp(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}  
                        type="text" 
                        placeholder="000000" 
                        className="w-full bg-transparent text-center text-2xl tracking-[0.5em] font-bold text-gray-900 outline-none placeholder-gray-400" 
                      />
                    </div>
                    <button disabled={loading || otp.length !== 6} type="submit" className="w-full py-4 rounded-xl font-bold text-sm tracking-wide shadow-lg active:scale-[0.98] transition-all duration-300 bg-gradient-to-r from-bird-orange to-bird-gold text-white shadow-bird-orange/20 disabled:opacity-50 disabled:cursor-not-allowed">
                      {loading ? 'VERIFYING...' : "Verify Email"}
                    </button>
                  </form>

                  <div className="flex items-center justify-between mt-6 w-full">
                    <button onClick={() => { setView('signup'); setOtp(''); }} className="text-sm text-gray-500 hover:text-gray-700 font-semibold transition-colors">
                      ← Go Back
                    </button>
                    <button 
                      disabled={!canResend || loading} 
                      onClick={async () => {
                        try {
                          setCanResend(false);
                          setResendTimer(60);
                          const res = await fetch(API_ENDPOINTS.auth.resendOtp, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email: registeredEmail })
                          });
                          const data = await res.json();
                          if (res.ok) {
                            notyf.success('New code sent!');
                          } else {
                            notyf.error(data.error || 'Failed to resend');
                          }
                        } catch {
                          notyf.error('Connection error');
                        }
                      }}
                      className="text-sm font-semibold transition-colors disabled:text-gray-400 text-bird-orange hover:text-bird-orange/80 disabled:cursor-not-allowed"
                    >
                      {canResend ? 'Resend Code' : `Resend in ${resendTimer}s`}
                    </button>
                  </div>
                </motion.div>
              )}

              {view === 'upload' && (
                <motion.div 
                  key="mobile-upload"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  className="flex flex-col items-center justify-center text-center h-full"
                >
                  <div className="w-16 h-16 bg-bird-gold/10 rounded-full flex items-center justify-center mb-6">
                    <svg className="w-8 h-8 text-bird-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Documents</h2>
                  <p className="text-sm text-gray-600 mb-6 px-2">
                    Upload your ID (DUI) to get verified.
                  </p>
                  
                  <label className="w-full border-2 border-dashed border-gray-300 rounded-2xl p-6 mb-3 bg-gray-50 flex flex-col items-center justify-center hover:bg-gray-100 transition-colors cursor-pointer">
                    <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span className="text-sm font-semibold text-gray-700">{duiFile ? duiFile.name : 'ID Document (Required)'}</span>
                    <input type="file" className="hidden" accept="image/*,.pdf" onChange={(e) => setDuiFile(e.target.files?.[0] || null)} />
                  </label>

                  <label className="w-full border-2 border-dashed border-gray-200 rounded-2xl p-4 mb-6 bg-gray-50 flex flex-col items-center justify-center hover:bg-gray-100 transition-colors cursor-pointer">
                    <span className="text-sm font-semibold text-gray-600">{certFile ? certFile.name : 'Certifications (Required)'}</span>
                    <input type="file" className="hidden" accept="image/*,.pdf" onChange={(e) => setCertFile(e.target.files?.[0] || null)} />
                  </label>

                  <div className="w-full flex flex-col gap-3">
                    <button disabled={loading || !duiFile || !certFile} onClick={handleUploadDocuments} className="w-full py-4 rounded-xl font-bold text-sm tracking-wide shadow-lg active:scale-[0.98] transition-all duration-300 bg-gradient-to-r from-bird-orange to-bird-gold text-white shadow-bird-orange/20 disabled:opacity-50 disabled:cursor-not-allowed">
                      {loading ? 'UPLOADING...' : 'Upload Files'}
                    </button>
                    <button onClick={handleFinishUpload} className="w-full py-4 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm tracking-wide hover:bg-gray-50 transition-all duration-300">
                      Skip for Now
                    </button>
                  </div>
                </motion.div>
              )}

              {view === 'signin' && (
                <motion.div 
                  key="mobile-signin"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                >
                  <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Pro Sign In</h2>
                    <p className="text-xs text-gray-600 px-4">Enter your credentials to access your dashboard.</p>
                  </div>
                  <form className="flex flex-col gap-3" onSubmit={handleSigninSubmit}>
                    <div className="bg-white rounded-xl px-4 py-3 border border-gray-200 focus-within:border-bird-orange/50 transition-colors shadow-sm">
                      <input required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} type="email" maxLength={100} placeholder="Email Address" className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder-gray-500" />
                    </div>
                    <div className="bg-white rounded-xl px-4 py-3 border border-gray-200 focus-within:border-bird-orange/50 transition-colors shadow-sm">
                      <input required value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} type="password" maxLength={128} placeholder="Password" className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder-gray-500" />
                    </div>
                    <div className="flex justify-end mt-1">
                      <button
                        type="button"
                        onClick={() => setView('forgot')}
                        className="text-xs text-gray-600 hover:text-bird-orange transition-colors"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <button disabled={loading} type="submit" className="mt-4 w-full py-4 rounded-xl font-bold text-sm tracking-wide shadow-lg active:scale-[0.98] transition-all duration-300 bg-gradient-to-r from-bird-orange to-bird-gold text-white shadow-bird-orange/20 disabled:opacity-50 disabled:cursor-not-allowed">
                      {loading ? 'PROCESSING...' : "Sign In"}
                    </button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

    </div>
  );
};
