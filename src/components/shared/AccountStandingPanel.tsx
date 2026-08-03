import React from 'react';
import { AlertTriangle, BadgeCheck, Clock, DollarSign, FileText, ShieldCheck } from 'lucide-react';

export type AccountPenaltyItem = {
  id_penalty: number;
  reason: string;
  amount: number;
  currency_code?: string;
  status: string;
  description?: string | null;
  payment_method?: string | null;
  payment_reference?: string | null;
  created_at?: string | null;
};

export type AccountAppealItem = {
  id_appeal: number;
  id_penalty: number;
  status: string;
  explanation?: string | null;
  admin_note?: string | null;
  reason?: string | null;
  amount?: number;
  currency_code?: string;
  penalty_status?: string;
  created_at?: string | null;
  reviewed_at?: string | null;
};

export type AccountEnforcementProfile = {
  trust_score?: number;
  standing?: string;
  completed_services?: number;
  incident_count?: number;
  active_restrictions?: Array<{ restriction_type: string; reason: string; ends_at?: string | null }>;
  incidents?: Array<{ id_incident: number; incident_type: string; severity: string; description?: string | null; action_taken: string; created_at: string }>;
};

type Props = {
  balance?: {
    has_blocking_debt?: boolean;
    outstanding_balance?: number;
    outstanding_count?: number;
    currency_code?: string;
    latest?: AccountPenaltyItem[];
  } | null;
  enforcement?: AccountEnforcementProfile | null;
  appeals?: AccountAppealItem[];
  variant?: 'light' | 'dark';
  compact?: boolean;
  onResolveBalance?: () => void;
  onAppealPenalty?: () => void;
};

const money = (value: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value || 0));

const label = (value?: string | null) =>
  String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) || 'Unknown';

const dateLabel = (value?: string | null) => {
  if (!value) return 'Pending';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Pending' : date.toLocaleDateString();
};

export const AccountStandingPanel: React.FC<Props> = ({
  balance,
  enforcement,
  appeals = [],
  variant = 'light',
  compact = false,
  onResolveBalance,
  onAppealPenalty,
}) => {
  const score = Number(enforcement?.trust_score ?? 100);
  const standing = String(enforcement?.standing || (balance?.has_blocking_debt ? 'warning' : 'good_standing'));
  const hasDebt = Boolean(balance?.has_blocking_debt);
  const restrictions = enforcement?.active_restrictions || [];
  const incidents = enforcement?.incidents || [];
  const latestPenalties = balance?.latest || [];
  const isDark = variant === 'dark';
  const statusTone = restrictions.length > 0 ? 'danger' : hasDebt || score < 75 ? 'warning' : 'good';
  const statusClasses = statusTone === 'danger'
    ? 'border-red-300 bg-red-50 text-red-800'
    : statusTone === 'warning'
      ? 'border-amber-300 bg-amber-50 text-amber-800'
      : 'border-emerald-300 bg-emerald-50 text-emerald-800';

  return (
    <section className={`rounded-[28px] border p-4 shadow-[0_18px_45px_rgba(15,23,42,0.08)] ${
      isDark ? 'border-white/10 bg-slate-950/82 text-white' : 'border-slate-200 bg-white text-slate-950'
    } ${compact ? 'space-y-4' : 'space-y-5'}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-bird-blue">Account Standing</p>
          <h3 className="mt-1 text-2xl font-black">{label(standing)}</h3>
          <p className={`mt-1 text-sm font-bold ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>
            {restrictions.length > 0
              ? 'Your account needs attention before using all Fixlife features.'
              : hasDebt
                ? 'Resolve or appeal the open balance to restore full access.'
                : 'Your account is clear and ready to use.'}
          </p>
        </div>
        <div className={`rounded-2xl border px-4 py-3 text-right ${statusClasses}`}>
          <p className="text-[10px] font-black uppercase tracking-[0.16em]">Trust score</p>
          <strong className="text-2xl">{score}/100</strong>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className={`rounded-2xl border p-3 ${isDark ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50'}`}>
          <ShieldCheck className="mb-2 h-5 w-5 text-bird-blue" />
          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">Incidents</p>
          <strong>{Number(enforcement?.incident_count || incidents.length || 0)}</strong>
        </div>
        <div className={`rounded-2xl border p-3 ${isDark ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50'}`}>
          <DollarSign className="mb-2 h-5 w-5 text-bird-orange" />
          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">Outstanding</p>
          <strong>{money(Number(balance?.outstanding_balance || 0), balance?.currency_code || 'USD')}</strong>
        </div>
        <div className={`rounded-2xl border p-3 ${isDark ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50'}`}>
          <BadgeCheck className="mb-2 h-5 w-5 text-emerald-500" />
          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">Completed</p>
          <strong>{Number(enforcement?.completed_services || 0)}</strong>
        </div>
      </div>

      {restrictions.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-500">Active restrictions</p>
          {restrictions.map((restriction, index) => (
            <div key={`${restriction.restriction_type}-${index}`} className="rounded-2xl border border-red-200 bg-red-50 p-3 text-red-900">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <strong>{label(restriction.restriction_type)}</strong>
                  <p className="text-sm font-semibold">{restriction.reason}</p>
                  <small>{restriction.ends_at ? `Ends ${dateLabel(restriction.ends_at)}` : 'Admin review required'}</small>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {(latestPenalties.length > 0 || appeals.length > 0 || incidents.length > 0) && (
        <div className="grid gap-3 xl:grid-cols-3">
          <div className={`rounded-2xl border p-3 ${isDark ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50'}`}>
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Open balances</p>
            {latestPenalties.length === 0 ? <p className="text-sm font-bold text-slate-400">No open balance.</p> : latestPenalties.map((item) => (
              <div key={item.id_penalty} className="border-t border-slate-200 py-2 first:border-t-0">
                <strong className="block text-sm">{label(item.reason)} - {money(item.amount, item.currency_code || 'USD')}</strong>
                <span className="text-xs font-bold text-slate-500">#{item.id_penalty} - {label(item.status)}</span>
              </div>
            ))}
          </div>

          <div className={`rounded-2xl border p-3 ${isDark ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50'}`}>
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Appeals</p>
            {appeals.length === 0 ? <p className="text-sm font-bold text-slate-400">No appeals submitted.</p> : appeals.slice(0, 3).map((appeal) => (
              <div key={appeal.id_appeal} className="border-t border-slate-200 py-2 first:border-t-0">
                <strong className="block text-sm">Appeal #{appeal.id_appeal}</strong>
                <span className="text-xs font-bold text-slate-500">{label(appeal.status)} - Penalty #{appeal.id_penalty}</span>
              </div>
            ))}
          </div>

          <div className={`rounded-2xl border p-3 ${isDark ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50'}`}>
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Recent behavior</p>
            {incidents.length === 0 ? <p className="text-sm font-bold text-slate-400">No recent incidents.</p> : incidents.slice(0, 3).map((incident) => (
              <div key={incident.id_incident} className="border-t border-slate-200 py-2 first:border-t-0">
                <strong className="block text-sm">{label(incident.incident_type)}</strong>
                <span className="text-xs font-bold text-slate-500">{label(incident.action_taken)} - {dateLabel(incident.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(hasDebt || latestPenalties.length > 0) && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={onResolveBalance} className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-bird-blue px-4 py-3 text-sm font-black text-white shadow-lg">
            <Clock className="h-4 w-4" /> Resolve balance
          </button>
          <button type="button" onClick={onAppealPenalty} className={`inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-black ${
            isDark ? 'border-white/10 bg-white/5 text-white' : 'border-slate-200 bg-white text-slate-800'
          }`}>
            <FileText className="h-4 w-4" /> Appeal penalty
          </button>
        </div>
      )}
    </section>
  );
};
