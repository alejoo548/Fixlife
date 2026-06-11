import { Check } from 'lucide-react';

const steps = [
  { key: 'assigned', label: 'Accepted' },
  { key: 'payment_pending', label: 'Approved' },
  { key: 'paid', label: 'Paid' },
  { key: 'traveling', label: 'On the way' },
  { key: 'arrived', label: 'Arrived' },
  { key: 'in_progress', label: 'Working' },
  { key: 'done', label: 'Completed' },
] as const;

export const WorkerRequestTimeline = ({
  status,
  routeActive = false,
  arrived = false,
}: {
  status: string;
  routeActive?: boolean;
  arrived?: boolean;
}) => {
  const normalized = String(status || '').toLowerCase();
  const visualStatus =
    normalized === 'awaiting_confirmation'
      ? 'in_progress'
      : normalized === 'paid' && arrived
        ? 'arrived'
        : normalized === 'paid' && routeActive
          ? 'traveling'
          : normalized;
  const currentIndex = Math.max(
    0,
    steps.findIndex((step) => step.key === visualStatus)
  );
  return (
    <div className="mt-4">
      <div className="flex items-start">
        {steps.map((step, index) => {
          const completed = index <= currentIndex;
          return (
            <div key={step.key} className="relative flex min-w-0 flex-1 flex-col items-center">
              {index < steps.length - 1 && (
                <div className={`absolute left-1/2 top-3 h-0.5 w-full ${
                  index < currentIndex ? 'bg-bird-blue' : 'bg-slate-200'
                }`} />
              )}
              <span className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full border ${
                completed
                  ? 'border-bird-blue bg-bird-blue text-white'
                  : 'border-slate-200 bg-white text-slate-300'
              }`}>
                {index < currentIndex ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span className={`mt-1 text-center text-[8px] font-black ${
                completed ? 'text-slate-700' : 'text-slate-400'
              }`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
