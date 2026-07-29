import { useEffect, useState } from 'react';
import { CheckCircle2, Navigation, Play, SquareCheckBig } from 'lucide-react';

interface WorkerCurrentJobActionProps {
  status: string;
  routeActive: boolean;
  arrived: boolean;
  canTravel: boolean;
  routeReady: boolean;
  busy: boolean;
  scheduledStartTime?: string | null;
  paymentMethod?: string | null;
  onTravel: () => void;
  onArrive: () => void;
  onStart: () => void;
  onComplete: () => void;
  onFinalize: () => void;
  onConfirmCash?: () => void;
  approvals?: {
    start_work: { client: boolean; worker: boolean };
    finish_work: { client: boolean; worker: boolean };
    complete_service: { client: boolean; worker: boolean };
  };
  workStartedAt?: string | null;
  clientApproved?: boolean;
}

export const WorkerCurrentJobAction = ({
  status,
  routeActive,
  arrived,
  canTravel,
  routeReady,
  busy,
  scheduledStartTime,
  paymentMethod,
  onTravel,
  onArrive,
  onStart,
  onComplete,
  onFinalize,
  onConfirmCash,
  approvals,
  workStartedAt,
  clientApproved,
}: WorkerCurrentJobActionProps) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const normalized = String(status || '').toLowerCase();
  let label = 'Waiting for approval';
  let hint = 'The next action will appear here automatically.';
  let icon = <Navigation className="h-5 w-5" />;
  let action: (() => void) | undefined;
  let disabled = true;
  let tone = 'bg-slate-300 text-white';

  if (normalized === 'assigned') {
    label = clientApproved ? 'Go to the job' : 'Waiting for client approval';
    const scheduledDate = scheduledStartTime ? new Date(scheduledStartTime) : null;
    const tooEarly = !canTravel && scheduledDate && !Number.isNaN(scheduledDate.getTime());
    hint = tooEarly
      ? `Navigation unlocks 2 h before the visit · ${scheduledDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} ${scheduledDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
      : clientApproved ? 'Start navigation and share your live position.' : 'Client must approve worker selection first.';
    action = clientApproved ? onTravel : undefined;
    disabled = !clientApproved || !canTravel || !routeReady;
    tone = 'bg-slate-950 text-white hover:bg-slate-800';
  } else if (normalized === 'route_in_progress') {
    label = 'I have arrived';
    hint = 'Confirm only when you are at the client address.';
    action = onArrive;
    disabled = false;
    icon = <CheckCircle2 className="h-5 w-5" />;
    tone = 'bg-bird-blue text-white hover:bg-bird-darkBlue';
  } else if (normalized === 'arrived' || normalized === 'start_pending') {
    const approved = Boolean(approvals?.start_work.worker);
    label = approved ? 'Waiting for client approval' : 'Approve work start';
    hint = approved ? 'Your approval is saved. Client must also approve.' : 'Work begins only after both parties approve.';
    action = approved ? undefined : onStart;
    disabled = busy || approved;
    icon = <Play className="h-5 w-5" />;
    tone = 'bg-emerald-600 text-white hover:bg-emerald-700';
  } else if (normalized === 'in_progress' || normalized === 'finish_pending') {
    const approved = Boolean(approvals?.finish_work.worker);
    const unlockAt = workStartedAt ? new Date(workStartedAt).getTime() + 1 * 60_000 : Number.POSITIVE_INFINITY;
    const remainingSeconds = Math.max(0, Math.ceil((unlockAt - now) / 1000));
    const unlocked = remainingSeconds === 0;
    label = approved ? 'Waiting for client approval' : unlocked ? 'Approve work finish' : `Finish unlocks in ${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, '0')}`;
    hint = approved ? 'Your finish approval is saved.' : 'Both parties must approve before payment unlocks.';
    action = approved || !unlocked ? undefined : onComplete;
    disabled = busy || approved || !unlocked;
    icon = <SquareCheckBig className="h-5 w-5" />;
    tone = 'bg-emerald-600 text-white hover:bg-emerald-700';
  } else if (normalized === 'payment_pending') {
    if (paymentMethod === 'cash') {
      label = 'Marcar como cobrado en efectivo';
      hint = 'Confirma que recibiste el pago en efectivo del cliente.';
      action = onConfirmCash;
      disabled = busy || !onConfirmCash;
      icon = <CheckCircle2 className="h-5 w-5" />;
      tone = 'bg-emerald-600 text-white hover:bg-emerald-700';
    } else {
      label = 'Waiting for client payment';
      hint = 'Both parties finished work. Client checkout is now available.';
    }
  } else if (normalized === 'paid' || normalized === 'completion_pending') {
    const approved = Boolean(approvals?.complete_service.worker);
    label = approved ? 'Waiting for client final approval' : 'Approve service completion';
    hint = approved ? 'Payment succeeded. Client must also close service.' : 'Final closure requires both approvals.';
    action = approved ? undefined : onFinalize;
    disabled = busy || approved;
    icon = <SquareCheckBig className="h-5 w-5" />;
    tone = 'bg-emerald-600 text-white hover:bg-emerald-700';
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
    <div className="rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-[0_14px_32px_rgba(15,23,42,0.08)] backdrop-blur">
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
