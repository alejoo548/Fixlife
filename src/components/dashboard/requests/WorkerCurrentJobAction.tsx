import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'es' ? 'es-SV' : 'en-US';
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const normalized = String(status || '').toLowerCase();
  let label = t('workerDashboard.currentJobAction.waitingForApproval');
  let hint = t('workerDashboard.currentJobAction.nextActionAppearsHere');
  let icon = <Navigation className="h-5 w-5" />;
  let action: (() => void) | undefined;
  let disabled = true;
  let tone = 'bg-slate-300 text-white';

  if (normalized === 'assigned') {
    label = clientApproved ? t('workerDashboard.currentJobAction.goToJob') : t('workerDashboard.currentJobAction.waitingForClientApproval');
    const scheduledDate = scheduledStartTime ? new Date(scheduledStartTime) : null;
    const tooEarly = !canTravel && scheduledDate && !Number.isNaN(scheduledDate.getTime());
    hint = tooEarly
      ? t('workerDashboard.currentJobAction.navigationUnlocks', {
          date: scheduledDate!.toLocaleDateString(dateLocale, { weekday: 'short', month: 'short', day: 'numeric' }),
          time: scheduledDate!.toLocaleTimeString(dateLocale, { hour: 'numeric', minute: '2-digit' }),
        })
      : clientApproved ? t('workerDashboard.currentJobAction.startNavigation') : t('workerDashboard.currentJobAction.clientMustApproveSelection');
    action = clientApproved ? onTravel : undefined;
    disabled = !clientApproved || !canTravel || !routeReady;
    tone = 'bg-slate-950 text-white hover:bg-slate-800';
  } else if (normalized === 'route_in_progress') {
    label = t('workerDashboard.currentJobAction.iHaveArrived');
    hint = t('workerDashboard.currentJobAction.confirmOnlyAtAddress');
    action = onArrive;
    disabled = false;
    icon = <CheckCircle2 className="h-5 w-5" />;
    tone = 'bg-bird-blue text-white hover:bg-bird-darkBlue';
  } else if (normalized === 'arrived' || normalized === 'start_pending') {
    const approved = Boolean(approvals?.start_work.worker);
    label = approved ? t('workerDashboard.currentJobAction.waitingForClientApproval') : t('workerDashboard.currentJobAction.approveWorkStart');
    hint = approved ? t('workerDashboard.currentJobAction.approvalSaved') : t('workerDashboard.currentJobAction.workBeginsAfterApproval');
    action = approved ? undefined : onStart;
    disabled = busy || approved;
    icon = <Play className="h-5 w-5" />;
    tone = 'bg-emerald-600 text-white hover:bg-emerald-700';
  } else if (normalized === 'in_progress' || normalized === 'finish_pending') {
    const approved = Boolean(approvals?.finish_work.worker);
    const unlockAt = workStartedAt ? new Date(workStartedAt).getTime() + 1 * 60_000 : Number.POSITIVE_INFINITY;
    const remainingSeconds = Math.max(0, Math.ceil((unlockAt - now) / 1000));
    const unlocked = remainingSeconds === 0;
    label = approved
      ? t('workerDashboard.currentJobAction.waitingForClientApproval')
      : unlocked
        ? t('workerDashboard.currentJobAction.approveWorkFinish')
        : t('workerDashboard.currentJobAction.finishUnlocksIn', {
            time: `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, '0')}`,
          });
    hint = approved ? t('workerDashboard.currentJobAction.finishApprovalSaved') : t('workerDashboard.currentJobAction.bothMustApproveBeforePayment');
    action = approved || !unlocked ? undefined : onComplete;
    disabled = busy || approved || !unlocked;
    icon = <SquareCheckBig className="h-5 w-5" />;
    tone = 'bg-emerald-600 text-white hover:bg-emerald-700';
  } else if (normalized === 'payment_pending') {
    if (paymentMethod === 'cash') {
      label = t('workerDashboard.currentJobAction.markCashCollected');
      hint = t('workerDashboard.currentJobAction.confirmCashReceived');
      action = onConfirmCash;
      disabled = busy || !onConfirmCash;
      icon = <CheckCircle2 className="h-5 w-5" />;
      tone = 'bg-emerald-600 text-white hover:bg-emerald-700';
    } else {
      label = t('workerDashboard.currentJobAction.waitingForClientPayment');
      hint = t('workerDashboard.currentJobAction.bothFinishedWorkCheckout');
    }
  } else if (normalized === 'paid' || normalized === 'completion_pending') {
    const approved = Boolean(approvals?.complete_service.worker);
    label = approved ? t('workerDashboard.currentJobAction.waitingForClientFinalApproval') : t('workerDashboard.currentJobAction.approveServiceCompletion');
    hint = approved ? t('workerDashboard.currentJobAction.paymentSucceeded') : t('workerDashboard.currentJobAction.finalClosureRequiresBoth');
    action = approved ? undefined : onFinalize;
    disabled = busy || approved;
    icon = <SquareCheckBig className="h-5 w-5" />;
    tone = 'bg-emerald-600 text-white hover:bg-emerald-700';
  } else if (normalized === 'done') {
    label = t('workerDashboard.currentJobAction.serviceCompleted');
    hint = t('workerDashboard.currentJobAction.jobClosedSuccessfully');
    icon = <CheckCircle2 className="h-5 w-5" />;
    tone = 'bg-emerald-100 text-emerald-800';
  } else if (normalized === 'payment_pending') {
    label = t('workerDashboard.currentJobAction.waitingForPayment');
    hint = t('workerDashboard.currentJobAction.navigationUnlocksOnPayment');
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
        {busy ? t('workerDashboard.currentJobAction.saving') : label}
      </button>
      <p className="mt-2 text-center text-[11px] font-semibold leading-4 text-slate-500">
        {hint}
      </p>
    </div>
  );
};
