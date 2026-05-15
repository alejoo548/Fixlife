import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { BrowserRouter } from 'react-router-dom';
import { AppErrorBoundary } from './components/common/AppErrorBoundary';

if (window.location.hostname === '127.0.0.1' && window.location.port === '3000') {
  window.location.replace(`http://localhost:3000${window.location.pathname}${window.location.search}${window.location.hash}`);
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const renderRuntimeFallback = (message: string) => {
  const root = document.getElementById('root');
  if (!root || root.childElementCount > 0) return;

  root.innerHTML = `
    <div style="min-height:100dvh;padding:24px;background:linear-gradient(135deg,#e0f2fe,#fef3c7,#fed7aa);font-family:Inter,system-ui,sans-serif;color:#0f172a;display:flex;align-items:center;justify-content:center;">
      <div style="width:min(420px,100%);border:1px solid rgba(186,230,253,.9);background:rgba(255,255,255,.95);border-radius:28px;padding:24px;box-shadow:0 24px 70px rgba(15,23,42,.16);">
        <img src="/Fixilogo.webp" alt="Fixlife" style="width:52px;height:52px;object-fit:contain;margin-bottom:12px;" />
        <p style="margin:0 0 6px;font-size:11px;font-weight:900;letter-spacing:.18em;text-transform:uppercase;color:#0284c7;">Fixlife</p>
        <h1 style="margin:0 0 10px;font-size:24px;line-height:1.1;font-weight:900;">Display issue</h1>
        <p style="margin:0 0 14px;font-size:14px;line-height:1.5;color:#475569;">The app could not finish loading this screen. Please refresh once.</p>
        <pre style="max-height:96px;overflow:auto;border-radius:16px;background:#020617;color:#bae6fd;padding:12px;font-size:11px;white-space:pre-wrap;">${message.replace(/[<>&]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[char] || char))}</pre>
        <button onclick="window.location.reload()" style="margin-top:16px;width:100%;border:0;border-radius:16px;background:#0090ff;color:white;padding:13px 16px;font-size:14px;font-weight:900;">Reload page</button>
      </div>
    </div>
  `;
};

window.addEventListener('error', (event) => {
  if (String(event.message || '').includes('Invalid LatLng object')) {
    event.preventDefault();
    console.warn('Ignored invalid map coordinate:', event.message);
    return;
  }
  renderRuntimeFallback(event.message || 'Unknown runtime error');
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error ? event.reason.message : String(event.reason || 'Unknown async error');
  if (reason.includes('Invalid LatLng object')) {
    event.preventDefault();
    console.warn('Ignored invalid map coordinate:', reason);
    return;
  }
  renderRuntimeFallback(reason);
});

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  </React.StrictMode>
);
