import { CheckCircle2, Navigation, Play, SquareCheckBig } from 'lucide-react';

interface WorkerCurrentJobActionProps {
  status: string;
  routeActive: boolean;
  arrived: boolean;
  canTravel: boolean;
  routeReady: boolean;
  busy: boolean;
  onTravel: () => void;
  onArrive: () => void;
  onStart: () => void;
  onComplete: () => void;
}

export const WorkerCurrentJobAction = ({
  status,
  routeActive,
  arrived,
  canTravel,
  routeReady,
  busy,
  onTravel,
  onArrive,
  onStart,
  onComplete,
}: WorkerCurrentJobActionProps) => {
  const normalized = String(status || '').toLowerCase();
  let label = 'Waiting for approval';
  let hint = 'The next action will appear here automatically.';
  let icon = <Navigation className="h-5 w-5" />;
  let action: (() => void) | undefined;
  let disabled = true;
  let tone = 'bg-slate-300 text-white';

  if (normalized === 'paid' && !routeActive && !arrived) {
    label = 'Go to the job';
    hint = 'Start navigation and share your live position.';
    action = onTravel;
    disabled = !canTravel || !routeReady;
    tone = 'bg-slate-950 text-white hover:bg-slate-800';
  } else if (normalized === 'paid' && routeActive && !arrived) {
    label = 'I have arrived';
    hint = 'Confirm only when you are at the client address.';
    action = onArrive;
    disabled = false;
    icon = <CheckCircle2 className="h-5 w-5" />;
    tone = 'bg-bird-blue text-white hover:bg-bird-darkBlue';
  } else if (normalized === 'paid' && arrived) {
    label = 'Start work';
    hint = 'The client will be notified that service has begun.';
    action = onStart;
    disabled = busy;
    icon = <Play className="h-5 w-5" />;
    tone = 'bg-emerald-600 text-white hover:bg-emerald-700';
  } else if (normalized === 'in_progress') {
    label = 'Finish job';
    hint = 'Send the service to the client for final confirmation.';
    action = onComplete;
    disabled = busy;
    icon = <SquareCheckBig className="h-5 w-5" />;
    tone = 'bg-emerald-600 text-white hover:bg-emerald-700';
  } else if (normalized === 'awaiting_confirmation') {
    label = 'Waiting for client confirmation';
    hint = 'The work is complete. We will notify you when the client confirms.';
  } else if (normalized === 'done') {
    label = 'Service completed';
    hint = 'This job has been closed successfully.';
    icon = <CheckCircle2 className="h-5 w-5" />;
    tone = 'bg-emerald-100 text-emerald-800';
  } else if (normalized === 'payment_pending') {
    label = 'Waiting for payment';
    hint = 'Navigation unlocks when the client completes payment.';
  }

  return (
    <div className="sticky bottom-0 mt-4 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur">
      <button
        type="button"
        onClick={action}
        disabled={disabled}
        className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-70 ${tone}`}
      >
        {icon}
        {busy ? 'Saving...' : label}
      </button>
      <p className="mt-2 text-center text-[11px] font-semibold leading-4 text-slate-500">
        {hint}
      </p>
    </div>
  );
};
