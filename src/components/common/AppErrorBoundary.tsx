import React from 'react';
import { recoverFromChunkError } from '../../utils/chunkRecovery';

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Fixlife render error:', error, info);
    recoverFromChunkError(error);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="min-h-[100dvh] bg-gradient-to-br from-sky-50 via-amber-50 to-orange-50 px-4 py-6 text-slate-950">
        <div className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-md flex-col justify-center">
          <div className="rounded-[2rem] border border-sky-100 bg-white/95 p-6 shadow-2xl shadow-sky-900/10">
            <div className="mb-4 flex items-center gap-3">
              <img src="/Fixilogo.webp" alt="Fixlife" className="h-12 w-12 object-contain" />
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-bird-blue">Fixlife</p>
                <h1 className="text-2xl font-black">We hit a display issue</h1>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-slate-600">
              The screen did not load correctly. Refresh the page; if it happens again, this panel keeps the app from going blank.
            </p>
            <pre className="mt-4 max-h-32 overflow-auto rounded-2xl bg-slate-950 p-3 text-[11px] text-sky-100">
              {this.state.error.message}
            </pre>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 w-full rounded-2xl bg-bird-blue px-4 py-3 text-sm font-black text-white shadow-lg shadow-bird-blue/20"
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
