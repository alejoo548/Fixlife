import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, CheckCircle2, DollarSign, Eye, ImageOff, RefreshCw, ShieldAlert, UserX } from 'lucide-react';
import Swal from 'sweetalert2';
import {
  AdminCard,
  DataTable,
  DetailDrawer,
  EmptyState,
  FilterBar,
  MetricCard,
  StatusBadge,
} from '../components/AdminUI';
import { adminApi } from '../api/adminApi';
import { showSweetAlert, showSweetToast } from '../../../utils/sweetAlert';

type Pagination = { page: number; pages: number; total: number; limit: number };

type Penalty = {
  id_penalty: number;
  id_user: number;
  id_worker_profile: number | null;
  id_request: number | null;
  actor_role: 'client' | 'worker';
  reason: string;
  amount: number;
  currency_code: string;
  status: 'pending' | 'paid' | 'disputed' | 'waived';
  description: string | null;
  created_at: string;
  resolved_at: string | null;
  user_name: string | null;
  user_lastname: string | null;
  user_email: string | null;
  service_name: string | null;
  payment_method?: string | null;
  payment_reference?: string | null;
  payment_recorded_by_user_id?: number | null;
};

type UploadReview = {
  id_review: number;
  id_user: number | null;
  id_request: number | null;
  upload_field: string | null;
  file_name: string;
  original_file_name: string | null;
  provider: string;
  model: string | null;
  decision: 'allow' | 'review' | 'block' | 'skipped';
  risk_type: string | null;
  flagged: boolean;
  reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  user_name: string | null;
  user_lastname: string | null;
  user_email: string | null;
  user_role: string | null;
  service_name: string | null;
  file_url: string | null;
  user_moderation_incidents?: number;
  user_content_penalties?: number;
};

type DisputeCase = {
  id_incident: number;
  id_user: number;
  actor_role: 'client' | 'worker' | string;
  incident_type: string;
  severity: 'low' | 'medium' | 'high' | string;
  source_type: string | null;
  source_id: number | null;
  id_request: number | null;
  description: string | null;
  action_taken: string;
  id_penalty: number | null;
  case_status: 'open' | 'reviewing' | 'resolved' | 'dismissed' | string;
  resolution_note: string | null;
  reviewed_by_user_id: number | null;
  reviewed_at: string | null;
  reviewer_name: string | null;
  reviewer_lastname: string | null;
  reviewer_email: string | null;
  created_at: string;
  evidence_snapshot_id: number | null;
  evidence_captured_at: string | null;
  user_name: string | null;
  user_lastname: string | null;
  user_email: string | null;
  user_role: string | null;
  penalty_amount: number | null;
  penalty_currency_code: string;
  penalty_status: string | null;
  request_status: string | null;
  service_name: string | null;
  location_text: string | null;
  request_created_at: string | null;
  client: { id_user: number; name: string; email: string | null } | null;
  worker: { id_user: number; id_worker_profile: number | null; name: string; email: string | null } | null;
  user_incident_count: number;
  active_restrictions: number;
  note_count: number;
};

type PenaltyDetail = {
  penalty: Penalty & { creator_name?: string | null; creator_lastname?: string | null; creator_email?: string | null };
  request: null | {
    id_request: number;
    service_name: string | null;
    status: string | null;
    location_text: string | null;
    description: string | null;
    created_at: string | null;
    updated_at: string | null;
  };
  images: Array<{ id_image: number; url: string | null; created_at: string }>;
  messages: Array<{ id_message: number; sender_role: string; message: string | null; image_url: string | null; created_at: string }>;
  reports: Array<{
    id_report: number;
    reporter_role: string;
    reason: string;
    description: string;
    status: string;
    evidence_image_url: string | null;
    created_at: string;
  }>;
  moderation_reviews: UploadReview[];
  appeals: Array<{
    id_appeal: number;
    id_penalty: number;
    id_user: number;
    explanation: string;
    evidence: string[];
    evidence_urls?: Array<string | null>;
    status: string;
    admin_note: string | null;
    reviewed_at: string | null;
    created_at: string;
    reviewer_name?: string | null;
    reviewer_lastname?: string | null;
    reviewer_email?: string | null;
  }>;
  enforcement?: {
    trust_score?: number;
    standing?: string;
    completed_services?: number;
    incident_count: number;
    active_restrictions: Array<{ id_restriction: number; restriction_type: string; reason: string; starts_at: string; ends_at: string | null; status: string }>;
    incidents: Array<{ id_incident: number; incident_type: string; severity: string; source_type: string | null; source_id: number | null; id_request: number | null; description: string | null; action_taken: string; id_penalty: number | null; created_at: string }>;
  };
  activity: Array<{ id_activity: number; action_type: string; summary: string; created_at: string; admin_name?: string | null; admin_lastname?: string | null; admin_email?: string | null }>;
};

type CaseEvidenceDetail = {
  id_snapshot: number;
  id_incident: number;
  id_request: number | null;
  id_user: number;
  actor_role: string;
  incident_type: string;
  created_at: string;
  snapshot: any;
  notes?: Array<{
    id_note: number;
    note_type: string;
    note: string;
    created_at: string;
    admin_name: string | null;
    admin_lastname: string | null;
    admin_email: string | null;
  }>;
};

const money = (value: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value || 0));

const personName = (item: { user_name?: string | null; user_lastname?: string | null; user_email?: string | null }) =>
  `${item.user_name || ''} ${item.user_lastname || ''}`.trim() || item.user_email || 'Unknown account';

const dateLabel = (value: string | null) => (value ? new Date(value).toLocaleString() : 'Pending');
const label = (value: string) => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

const promptReason = async (input: { title: string; message: string; confirmText: string; destructive?: boolean }) => {
  const result = await Swal.fire({
    icon: input.destructive ? 'warning' : 'info',
    title: input.title,
    text: input.message,
    input: 'textarea',
    inputPlaceholder: 'Reason for this admin decision...',
    inputAttributes: { maxlength: '500' },
    showCancelButton: true,
    confirmButtonText: input.confirmText,
    cancelButtonText: 'Go back',
    reverseButtons: true,
    focusCancel: true,
    buttonsStyling: false,
    inputValidator: (value) => (String(value || '').trim().length < 8 ? 'Write at least 8 characters.' : undefined),
    customClass: {
      popup: 'rounded-[28px] border border-slate-200 px-5 pb-6 pt-7 shadow-2xl',
      title: 'text-2xl font-black text-slate-950',
      input: 'min-h-[120px] rounded-2xl border border-slate-200 p-4 text-sm font-semibold text-slate-800',
      actions: 'mt-6 flex w-full gap-3 px-3',
      cancelButton: 'flex-1 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700',
      confirmButton: input.destructive
        ? 'flex-1 rounded-2xl bg-red-600 px-5 py-3 text-sm font-black text-white shadow-lg'
        : 'flex-1 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg',
    },
  });
  return result.isConfirmed ? String(result.value || '').trim() : null;
};

const promptAmount = async () => {
  const result = await Swal.fire({
    icon: 'warning',
    title: 'Create content penalty',
    text: 'Enter the penalty amount. Use this only for confirmed policy abuse.',
    input: 'text',
    inputPlaceholder: '10.00',
    showCancelButton: true,
    confirmButtonText: 'Continue',
    cancelButtonText: 'Go back',
    buttonsStyling: false,
    inputValidator: (value) => {
      const n = Number(value);
      return Number.isFinite(n) && n >= 0 && n <= 1000 ? undefined : 'Amount must be 0-1000.';
    },
  });
  return result.isConfirmed ? Number(result.value) : null;
};

const promptEditPenaltyAmount = async (currentAmount: number) => {
  const result = await Swal.fire({
    icon: 'info',
    title: 'Edit penalty amount',
    text: 'Set the corrected penalty amount. This change requires an admin note after this step.',
    input: 'text',
    inputValue: String(Number(currentAmount || 0).toFixed(2)),
    inputPlaceholder: '10.00',
    showCancelButton: true,
    confirmButtonText: 'Continue',
    cancelButtonText: 'Go back',
    buttonsStyling: false,
    inputValidator: (value) => {
      const n = Number(value);
      return Number.isFinite(n) && n >= 0 && n <= 1000 ? undefined : 'Amount must be 0-1000.';
    },
  });
  return result.isConfirmed ? Number(result.value) : null;
};

const promptManualPenalty = async () => {
  const result = await Swal.fire({
    icon: 'warning',
    title: 'Create manual penalty',
    html: `
      <div style="text-align:left;display:grid;gap:12px">
        <label style="display:grid;gap:6px;font-weight:900">User ID
          <input id="manual-penalty-user" inputmode="numeric" placeholder="Example: 12" style="width:100%;border:1px solid #dbe4f0;border-radius:14px;padding:11px;font-weight:800" />
        </label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <label style="display:grid;gap:6px;font-weight:900">Role
            <select id="manual-penalty-role" style="width:100%;border:1px solid #dbe4f0;border-radius:14px;padding:11px;font-weight:800">
              <option value="client">Client</option>
              <option value="worker">Worker</option>
            </select>
          </label>
          <label style="display:grid;gap:6px;font-weight:900">Amount USD
            <input id="manual-penalty-amount" inputmode="decimal" value="10.00" style="width:100%;border:1px solid #dbe4f0;border-radius:14px;padding:11px;font-weight:800" />
          </label>
        </div>
        <label style="display:grid;gap:6px;font-weight:900">Reason
          <select id="manual-penalty-reason" style="width:100%;border:1px solid #dbe4f0;border-radius:14px;padding:11px;font-weight:800">
            <option value="no_show">No-show</option>
            <option value="unjustified_cancel">Unjustified cancellation</option>
            <option value="abusive_report">Abusive report</option>
            <option value="outside_app_payment">Outside app payment</option>
            <option value="inappropriate_content">Inappropriate content</option>
            <option value="unpaid_cash">Unpaid cash</option>
            <option value="payment_dispute">Payment dispute</option>
            <option value="admin_adjustment">Admin adjustment</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label style="display:grid;gap:6px;font-weight:900">Request ID (optional)
          <input id="manual-penalty-request" inputmode="numeric" placeholder="Link to request if needed" style="width:100%;border:1px solid #dbe4f0;border-radius:14px;padding:11px;font-weight:800" />
        </label>
        <label style="display:grid;gap:6px;font-weight:900">Admin description
          <textarea id="manual-penalty-description" maxlength="500" placeholder="Explain what happened and why this penalty is correct..." style="width:100%;min-height:110px;border:1px solid #dbe4f0;border-radius:14px;padding:11px;font-weight:800"></textarea>
        </label>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Create penalty',
    cancelButtonText: 'Cancel',
    reverseButtons: true,
    buttonsStyling: false,
    preConfirm: () => {
      const idUser = Number((document.getElementById('manual-penalty-user') as HTMLInputElement | null)?.value || 0);
      const amount = Number((document.getElementById('manual-penalty-amount') as HTMLInputElement | null)?.value || 0);
      const requestRaw = (document.getElementById('manual-penalty-request') as HTMLInputElement | null)?.value?.trim() || '';
      const idRequest = requestRaw ? Number(requestRaw) : null;
      const description = (document.getElementById('manual-penalty-description') as HTMLTextAreaElement | null)?.value?.trim() || '';
      if (!Number.isInteger(idUser) || idUser <= 0) {
        Swal.showValidationMessage('Enter a valid user id.');
        return false;
      }
      if (!Number.isFinite(amount) || amount < 0 || amount > 1000) {
        Swal.showValidationMessage('Amount must be 0-1000.');
        return false;
      }
      if (idRequest !== null && (!Number.isInteger(idRequest) || idRequest <= 0)) {
        Swal.showValidationMessage('Request id must be a positive number.');
        return false;
      }
      if (description.length < 8) {
        Swal.showValidationMessage('Write at least 8 characters in the description.');
        return false;
      }
      return {
        id_user: idUser,
        actor_role: (document.getElementById('manual-penalty-role') as HTMLSelectElement | null)?.value || 'client',
        reason: (document.getElementById('manual-penalty-reason') as HTMLSelectElement | null)?.value || 'admin_adjustment',
        amount,
        id_request: idRequest,
        description,
      };
    },
  });
  return result.isConfirmed ? result.value as { id_user: number; actor_role: string; reason: string; amount: number; id_request: number | null; description: string } : null;
};

const promptCasePenalty = async () => {
  const result = await Swal.fire({
    icon: 'warning',
    title: 'Create penalty from case',
    html: `
      <div style="text-align:left">
        <label style="display:block;font-weight:800;margin-bottom:8px">Penalty reason</label>
        <select id="case-penalty-reason" style="width:100%;border:1px solid #dbe4f0;border-radius:14px;padding:10px;font-weight:800">
          <option value="no_show">No-show</option>
          <option value="unjustified_cancel">Unjustified cancellation</option>
          <option value="outside_app_payment">Outside app payment</option>
          <option value="payment_dispute">Payment dispute</option>
          <option value="admin_adjustment">Admin adjustment</option>
          <option value="other">Other</option>
        </select>
        <label style="display:block;font-weight:800;margin:14px 0 8px">Amount USD</label>
        <input id="case-penalty-amount" inputmode="decimal" value="10.00" style="width:100%;border:1px solid #dbe4f0;border-radius:14px;padding:10px;font-weight:800" />
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Continue',
    cancelButtonText: 'Go back',
    buttonsStyling: false,
    preConfirm: () => {
      const amount = Number((document.getElementById('case-penalty-amount') as HTMLInputElement | null)?.value || 0);
      if (!Number.isFinite(amount) || amount < 0 || amount > 1000) {
        Swal.showValidationMessage('Amount must be 0-1000.');
        return false;
      }
      return {
        amount,
        penalty_reason: (document.getElementById('case-penalty-reason') as HTMLSelectElement | null)?.value || 'admin_adjustment',
      };
    },
  });
  return result.isConfirmed ? result.value as { amount: number; penalty_reason: string } : null;
};

const promptPaymentInfo = async () => {
  const result = await Swal.fire({
    icon: 'info',
    title: 'Record balance payment',
    html: `
      <div style="text-align:left">
        <label style="display:block;font-weight:800;margin-bottom:8px">Payment method</label>
        <select id="payment-method" style="width:100%;border:1px solid #dbe4f0;border-radius:14px;padding:10px;font-weight:800">
          <option value="cash">Cash</option>
          <option value="transfer">Transfer</option>
          <option value="card">Card</option>
          <option value="support_adjustment">Support adjustment</option>
          <option value="other">Other</option>
        </select>
        <label style="display:block;font-weight:800;margin:14px 0 8px">Reference</label>
        <input id="payment-reference" maxlength="180" style="width:100%;border:1px solid #dbe4f0;border-radius:14px;padding:10px;font-weight:800" placeholder="Receipt, admin note, cash confirmation..." />
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Continue',
    cancelButtonText: 'Cancel',
    buttonsStyling: false,
    preConfirm: () => ({
      payment_method: (document.getElementById('payment-method') as HTMLSelectElement | null)?.value || 'support_adjustment',
      payment_reference: (document.getElementById('payment-reference') as HTMLInputElement | null)?.value?.trim() || '',
    }),
  });
  return result.isConfirmed ? result.value : null;
};

export default function TrustSafetyModule() {
  const [tab, setTab] = useState<'disputes' | 'penalties' | 'uploads'>('disputes');
  const [disputes, setDisputes] = useState<DisputeCase[]>([]);
  const [penalties, setPenalties] = useState<Penalty[]>([]);
  const [reviews, setReviews] = useState<UploadReview[]>([]);
  const [disputeSummary, setDisputeSummary] = useState({ total_cases: 0, high_count: 0, penalty_count: 0, restricted_count: 0, reviewing_count: 0, resolved_count: 0 });
  const [penaltySummary, setPenaltySummary] = useState({ outstanding_amount: 0, pending_count: 0, disputed_count: 0, paid_count: 0, waived_count: 0 });
  const [reviewSummary, setReviewSummary] = useState({ pending_count: 0, resolved_count: 0, resolved_month_count: 0, blocked_count: 0, review_count: 0, allow_count: 0, skipped_count: 0 });
  const [disputePagination, setDisputePagination] = useState<Pagination>({ page: 1, pages: 1, total: 0, limit: 25 });
  const [penaltyPagination, setPenaltyPagination] = useState<Pagination>({ page: 1, pages: 1, total: 0, limit: 25 });
  const [reviewPagination, setReviewPagination] = useState<Pagination>({ page: 1, pages: 1, total: 0, limit: 25 });
  const [brokenReviewImages, setBrokenReviewImages] = useState<Record<number, boolean>>({});
  const [disputeStatus, setDisputeStatus] = useState('open');
  const [disputeRole, setDisputeRole] = useState('all');
  const [disputeSearch, setDisputeSearch] = useState('');
  const [penaltyStatus, setPenaltyStatus] = useState('pending');
  const [penaltyRole, setPenaltyRole] = useState('all');
  const [penaltySearch, setPenaltySearch] = useState('');
  const [reviewDecision, setReviewDecision] = useState('pending');
  const [reviewProvider, setReviewProvider] = useState('all');
  const [reviewSearch, setReviewSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<PenaltyDetail | null>(null);
  const [caseEvidence, setCaseEvidence] = useState<CaseEvidenceDetail | null>(null);
  const [caseEvidenceLoading, setCaseEvidenceLoading] = useState(false);

  const disputeQuery = useMemo(() => {
    const params = new URLSearchParams({ status: disputeStatus, role: disputeRole, page: String(disputePagination.page), limit: '25' });
    if (disputeSearch.trim()) params.set('q', disputeSearch.trim());
    return params.toString();
  }, [disputeStatus, disputeRole, disputeSearch, disputePagination.page]);

  const penaltyQuery = useMemo(() => {
    const params = new URLSearchParams({ status: penaltyStatus, role: penaltyRole, page: String(penaltyPagination.page), limit: '25' });
    if (penaltySearch.trim()) params.set('q', penaltySearch.trim());
    return params.toString();
  }, [penaltyStatus, penaltyRole, penaltySearch, penaltyPagination.page]);

  const reviewQuery = useMemo(() => new URLSearchParams({
    decision: reviewDecision,
    provider: reviewProvider,
    page: String(reviewPagination.page),
    limit: '25',
    ...(reviewSearch.trim() ? { q: reviewSearch.trim() } : {}),
  }).toString(), [reviewDecision, reviewProvider, reviewPagination.page, reviewSearch]);

  const loadDisputes = useCallback(async () => {
    const payload = await adminApi.get<{ cases: DisputeCase[]; summary: typeof disputeSummary; pagination: Pagination }>(
      `${adminApi.endpoints.disputeCases}?${disputeQuery}`,
      true
    );
    setDisputes(payload.cases || []);
    setDisputeSummary(payload.summary || disputeSummary);
    setDisputePagination(payload.pagination || disputePagination);
  }, [disputeQuery]);

  const loadPenalties = useCallback(async () => {
    const payload = await adminApi.get<{ penalties: Penalty[]; summary: typeof penaltySummary; pagination: Pagination }>(
      `${adminApi.endpoints.penalties}?${penaltyQuery}`,
      true
    );
    setPenalties(payload.penalties || []);
    setPenaltySummary(payload.summary || penaltySummary);
    setPenaltyPagination(payload.pagination || penaltyPagination);
  }, [penaltyQuery]);

  const loadReviews = useCallback(async () => {
    const payload = await adminApi.get<{ reviews: UploadReview[]; summary: typeof reviewSummary; pagination: Pagination }>(
      `${adminApi.endpoints.uploadModeration}?${reviewQuery}`,
      true
    );
    setReviews(payload.reviews || []);
    setReviewSummary(payload.summary || reviewSummary);
    setReviewPagination(payload.pagination || reviewPagination);
  }, [reviewQuery]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadDisputes(), loadPenalties(), loadReviews()]);
    } catch (error) {
      showSweetAlert({ tone: 'error', title: 'Could not load Trust & Safety', message: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setLoading(false);
    }
  }, [loadDisputes, loadPenalties, loadReviews]);

  useEffect(() => { void load(); }, [load]);

  const openPenaltyDetail = async (penalty: Penalty) => {
    try {
      const payload = await adminApi.get<{ detail: PenaltyDetail }>(adminApi.endpoints.penaltyDetail(penalty.id_penalty), true);
      setDetail(payload.detail);
    } catch (error) {
      showSweetAlert({ tone: 'error', title: 'Could not load penalty detail', message: error instanceof Error ? error.message : 'Please try again.' });
    }
  };

  const openDisputePenaltyDetail = async (item: DisputeCase) => {
    if (!item.id_penalty) {
      showSweetToast({ tone: 'info', message: 'This dispute has no linked penalty yet.' });
      return;
    }
    await openPenaltyDetail({
      id_penalty: item.id_penalty,
      id_user: item.id_user,
      id_worker_profile: item.worker?.id_worker_profile ?? null,
      id_request: item.id_request,
      actor_role: item.actor_role === 'worker' ? 'worker' : 'client',
      reason: item.incident_type,
      amount: item.penalty_amount || 0,
      currency_code: item.penalty_currency_code || 'USD',
      status: (item.penalty_status || 'pending') as Penalty['status'],
      description: item.description,
      created_at: item.created_at,
      resolved_at: null,
      user_name: item.user_name,
      user_lastname: item.user_lastname,
      user_email: item.user_email,
      service_name: item.service_name,
    });
  };

  const openCaseEvidence = async (item: DisputeCase) => {
    if (!item.evidence_snapshot_id) {
      showSweetToast({ tone: 'info', message: 'This case does not have a captured evidence snapshot yet.' });
      return;
    }
    setCaseEvidenceLoading(true);
    try {
      const payload = await adminApi.get<{ evidence: CaseEvidenceDetail }>(adminApi.endpoints.disputeCaseEvidence(item.id_incident), true);
      setCaseEvidence(payload.evidence);
    } catch (error) {
      showSweetAlert({ tone: 'error', title: 'Could not load case evidence', message: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setCaseEvidenceLoading(false);
    }
  };

  const runDisputeAction = async (
    item: DisputeCase,
    action: 'set_reviewing' | 'add_note' | 'create_penalty' | 'keep_penalty' | 'waive_penalty' | 'mark_paid' | 'clear_restrictions' | 'reassign_request' | 'cancel_request' | 'resolve_request' | 'close_case' | 'dismiss_case'
  ) => {
    const labels = {
      set_reviewing: ['Move case to reviewing?', 'Start review'],
      add_note: ['Add case note?', 'Add note'],
      create_penalty: ['Create penalty from case?', 'Create penalty'],
      keep_penalty: ['Keep penalty?', 'Keep penalty'],
      waive_penalty: ['Waive penalty?', 'Waive penalty'],
      mark_paid: ['Mark penalty as paid?', 'Mark paid'],
      clear_restrictions: ['Clear active restrictions?', 'Clear restrictions'],
      reassign_request: ['Reassign request?', 'Reassign request'],
      cancel_request: ['Cancel request?', 'Cancel request'],
      resolve_request: ['Resolve request?', 'Resolve request'],
      close_case: ['Close case as resolved?', 'Close case'],
      dismiss_case: ['Dismiss case?', 'Dismiss case'],
    } as const;
    const penaltyInput = action === 'create_penalty' ? await promptCasePenalty() : null;
    if (action === 'create_penalty' && !penaltyInput) return;
    const reason = await promptReason({
      title: labels[action][0],
      message: `Case #${item.id_incident} will be updated and logged. Write why this decision is correct.`,
      confirmText: labels[action][1],
      destructive: ['waive_penalty', 'cancel_request', 'dismiss_case'].includes(action),
    });
    if (!reason) return;

    setSaving(true);
    try {
      await adminApi.post(adminApi.endpoints.disputeCaseAction(item.id_incident), { action, reason, ...(penaltyInput || {}) });
      showSweetToast({ tone: 'success', message: 'Dispute case updated.' });
      await Promise.all([loadDisputes(), loadPenalties()]);
      if (caseEvidence?.id_incident === item.id_incident) await openCaseEvidence(item);
    } catch (error) {
      showSweetAlert({ tone: 'error', title: 'Could not update dispute', message: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const runPenaltyAction = async (penalty: Penalty, action: 'mark_paid' | 'waive' | 'dispute' | 'edit' | 'clear_restrictions') => {
    const actionLabel = action === 'mark_paid' ? 'mark as paid' : action === 'waive' ? 'waive' : action === 'dispute' ? 'put in dispute' : action === 'clear_restrictions' ? 'clear active restrictions' : 'edit amount';
    const nextAmount = action === 'edit' ? await promptEditPenaltyAmount(penalty.amount) : null;
    if (action === 'edit' && nextAmount === null) return;
    const reason = await promptReason({
      title: `Confirm penalty #${penalty.id_penalty}`,
      message: `Write a clear admin note to ${actionLabel} this penalty. This action is audited.`,
      confirmText: action === 'clear_restrictions' ? 'Clear restrictions' : `Confirm ${actionLabel}`,
      destructive: action === 'waive' || action === 'dispute',
    });
    if (!reason) return;
    const paymentInfo = action === 'mark_paid' ? await promptPaymentInfo() : null;
    if (action === 'mark_paid' && !paymentInfo) return;

    setSaving(true);
    try {
      await adminApi.post(adminApi.endpoints.penaltyAction(penalty.id_penalty), {
        action,
        reason,
        amount: nextAmount ?? undefined,
        ...(paymentInfo || {}),
      });
      showSweetToast({ tone: 'success', message: 'Penalty updated.' });
      await loadPenalties();
      if (detail?.penalty.id_penalty === penalty.id_penalty) await openPenaltyDetail(penalty);
    } catch (error) {
      showSweetAlert({ tone: 'error', title: 'Could not update penalty', message: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const createManualPenalty = async () => {
    const input = await promptManualPenalty();
    if (!input) return;
    setSaving(true);
    try {
      const payload = await adminApi.post<{ id_penalty: number }>(adminApi.endpoints.penalties, input);
      showSweetToast({ tone: 'success', message: `Penalty #${payload.id_penalty} created.` });
      setTab('penalties');
      setPenaltyStatus('pending');
      setPenaltyPagination((p) => ({ ...p, page: 1 }));
      await loadPenalties();
    } catch (error) {
      showSweetAlert({ tone: 'error', title: 'Could not create penalty', message: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const runAppealAction = async (
    appeal: PenaltyDetail['appeals'][number],
    input: { status: 'accepted' | 'rejected' | 'needs_more_info'; penalty_action: 'waive' | 'keep' | 'reduce' | 'suspend' | 'none' }
  ) => {
    const amount = input.penalty_action === 'reduce' ? await promptAmount() : null;
    if (input.penalty_action === 'reduce' && amount === null) return;
    const reason = await promptReason({
      title: `Review appeal #${appeal.id_appeal}`,
      message: 'Write the Trust & Safety decision. This note is audited and sent to the account.',
      confirmText: 'Save decision',
      destructive: input.penalty_action === 'suspend' || input.status === 'rejected',
    });
    if (!reason) return;

    setSaving(true);
    try {
      await adminApi.post(adminApi.endpoints.penaltyAppealAction(appeal.id_appeal), {
        status: input.status,
        penalty_action: input.penalty_action,
        admin_note: reason,
        amount: amount ?? undefined,
      });
      showSweetToast({ tone: 'success', message: 'Appeal reviewed.' });
      await Promise.all([loadPenalties(), detail ? openPenaltyDetail(detail.penalty) : Promise.resolve()]);
    } catch (error) {
      showSweetAlert({ tone: 'error', title: 'Could not review appeal', message: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const runReviewAction = async (review: UploadReview, action: 'approve' | 'block' | 'create_penalty' | 'suspend_user') => {
    const amount = action === 'create_penalty' ? await promptAmount() : null;
    if (action === 'create_penalty' && amount === null) return;

    const reason = await promptReason({
      title: `Review upload #${review.id_review}`,
      message: action === 'suspend_user' ? 'This disables the account. Add a clear reason.' : 'This moderation decision is audited.',
      confirmText: action === 'approve' ? 'Approve upload' : action === 'suspend_user' ? 'Suspend account' : action === 'create_penalty' ? 'Create penalty' : 'Block upload',
      destructive: action === 'suspend_user' || action === 'block',
    });
    if (!reason) return;

    setSaving(true);
    try {
      await adminApi.post(adminApi.endpoints.uploadModerationAction(review.id_review), { action, reason, amount: amount ?? undefined });
      showSweetToast({ tone: 'success', message: 'Moderation review updated.' });
      await Promise.all([loadReviews(), loadPenalties()]);
    } catch (error) {
      showSweetAlert({ tone: 'error', title: 'Could not update moderation', message: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const approveSafeSkipped = async () => {
    const reason = await promptReason({
      title: 'Approve safe skipped uploads',
      message: 'This marks up to 100 skipped uploads as allowed when they have no local risk flag.',
      confirmText: 'Approve skipped',
    });
    if (!reason) return;
    setSaving(true);
    try {
      const payload = await adminApi.post<{ affected_rows: number }>(adminApi.endpoints.approveSafeSkippedUploads, { reason });
      showSweetToast({ tone: 'success', message: `${payload.affected_rows || 0} upload reviews approved.` });
      await loadReviews();
    } catch (error) {
      showSweetAlert({ tone: 'error', title: 'Could not approve skipped uploads', message: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  return <div className="admin-page-stack">
    <div className="admin-tabs">
      <button className={tab === 'disputes' ? 'active' : ''} onClick={() => setTab('disputes')}>Disputes</button>
      <button className={tab === 'penalties' ? 'active' : ''} onClick={() => setTab('penalties')}>Penalties</button>
      <button className={tab === 'uploads' ? 'active' : ''} onClick={() => setTab('uploads')}>Upload moderation</button>
      <button onClick={load} aria-label="Refresh"><RefreshCw size={14} /></button>
    </div>

    <div className="admin-metric-grid">
      <MetricCard label="Dispute cases" value={disputeSummary.total_cases} note="Cancellation and no-show incidents" icon={<ShieldAlert />} variant="info" />
      <MetricCard label="High priority" value={disputeSummary.high_count} note="Needs faster review" icon={<ShieldAlert />} variant="danger" />
      <MetricCard label="In review" value={disputeSummary.reviewing_count} note="Admin is checking evidence" icon={<Eye />} variant="info" />
      <MetricCard label="Outstanding balance" value={money(penaltySummary.outstanding_amount)} note="Pending + disputed" icon={<DollarSign />} variant="warning" />
    </div>

    {tab === 'disputes' && <>
      <FilterBar>
        <label className="admin-search-field"><span>Status</span><select value={disputeStatus} onChange={(event) => { setDisputePagination((p) => ({ ...p, page: 1 })); setDisputeStatus(event.target.value); }}><option value="open">Open / active</option><option value="reviewing">Reviewing</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option><option value="penalty">With penalty</option><option value="restricted">Restricted account</option><option value="all">All</option></select></label>
        <label className="admin-search-field"><span>Role</span><select value={disputeRole} onChange={(event) => { setDisputePagination((p) => ({ ...p, page: 1 })); setDisputeRole(event.target.value); }}><option value="all">All roles</option><option value="client">Client</option><option value="worker">Worker</option></select></label>
        <label className="admin-search-field"><span>Search</span><input maxLength={120} value={disputeSearch} placeholder="Case, request, email..." onChange={(event) => { setDisputePagination((p) => ({ ...p, page: 1 })); setDisputeSearch(event.target.value); }} /></label>
      </FilterBar>
      {loading ? <AdminCard>Loading dispute cases...</AdminCard> : disputes.length === 0 ? <EmptyState title="No dispute cases found" description="Late cancellations, worker no-shows and client no-shows will appear here." /> : <>
        <div className="grid gap-4 xl:grid-cols-2">
          {disputes.map((item) => (
            <AdminCard key={item.id_incident} className="overflow-hidden">
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="admin-primary-cell">
                    <strong>Case #{item.id_incident} - {label(item.incident_type)}</strong>
                    <span>{personName(item)} - {item.actor_role}</span>
                    <small>{dateLabel(item.created_at)}</small>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <StatusBadge status={item.severity} />
                    <StatusBadge status={item.case_status || 'open'} />
                    <StatusBadge status={item.action_taken} />
                    {item.penalty_status && <StatusBadge status={item.penalty_status} />}
                  </div>
                </div>

                <p className="admin-muted">{item.description || 'No description was recorded.'}</p>

                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-white/70 p-3 dark:border-white/10 dark:bg-white/5">
                    <p className="admin-eyebrow">Request</p>
                    <strong>{item.id_request ? `#${item.id_request}` : 'None'}</strong>
                    <span className="admin-muted block">{item.request_status ? label(item.request_status) : 'No status'}</span>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white/70 p-3 dark:border-white/10 dark:bg-white/5">
                    <p className="admin-eyebrow">Penalty</p>
                    <strong>{item.penalty_amount != null ? money(item.penalty_amount, item.penalty_currency_code) : 'No penalty'}</strong>
                    <span className="admin-muted block">{item.id_penalty ? `#${item.id_penalty}` : 'Warning only'}</span>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white/70 p-3 dark:border-white/10 dark:bg-white/5">
                    <p className="admin-eyebrow">Behavior</p>
                    <strong>{item.user_incident_count} incident(s)</strong>
                    <span className="admin-muted block">{item.active_restrictions} active restriction(s) - {item.note_count} note(s)</span>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 p-3 dark:border-white/10">
                    <p className="admin-eyebrow">Client</p>
                    <strong>{item.client?.name || 'No client'}</strong>
                    <p className="admin-muted">{item.client?.email || 'No email'}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-3 dark:border-white/10">
                    <p className="admin-eyebrow">Worker</p>
                    <strong>{item.worker?.name || 'No worker'}</strong>
                    <p className="admin-muted">{item.worker?.email || 'No email'}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
                  <p className="admin-eyebrow">Service and location</p>
                  <strong>{item.service_name || 'Unknown service'}</strong>
                  <p className="admin-muted">{item.location_text || 'No location recorded.'}</p>
                </div>

                <div className="admin-action-row">
                  <button className="admin-button admin-button--small admin-button--secondary" disabled={caseEvidenceLoading || !item.evidence_snapshot_id} onClick={() => openCaseEvidence(item)}><Eye size={13} />Case evidence</button>
                  <button className="admin-button admin-button--small admin-button--secondary" disabled={!item.id_penalty} onClick={() => openDisputePenaltyDetail(item)}>Penalty detail</button>
                  <button className="admin-button admin-button--small admin-button--secondary" disabled={saving || item.case_status === 'reviewing'} onClick={() => runDisputeAction(item, 'set_reviewing')}>Review</button>
                  <button className="admin-button admin-button--small admin-button--secondary" disabled={saving} onClick={() => runDisputeAction(item, 'add_note')}>Add note</button>
                  <button className="admin-button admin-button--small" disabled={saving || !!item.id_penalty || item.case_status === 'resolved' || item.case_status === 'dismissed'} onClick={() => runDisputeAction(item, 'create_penalty')}>Create penalty</button>
                  <button className="admin-button admin-button--small" disabled={saving || !item.id_penalty} onClick={() => runDisputeAction(item, 'keep_penalty')}>Keep penalty</button>
                  <button className="admin-button admin-button--small admin-button--secondary" disabled={saving || !item.id_penalty} onClick={() => runDisputeAction(item, 'waive_penalty')}>Waive</button>
                  <button className="admin-button admin-button--small admin-button--secondary" disabled={saving || !item.id_penalty} onClick={() => runDisputeAction(item, 'mark_paid')}>Paid</button>
                  <button className="admin-button admin-button--small admin-button--secondary" disabled={saving || !item.active_restrictions} onClick={() => runDisputeAction(item, 'clear_restrictions')}>Clear block</button>
                  <button className="admin-button admin-button--small admin-button--secondary" disabled={saving || !item.id_request} onClick={() => runDisputeAction(item, 'reassign_request')}>Reassign</button>
                  <button className="admin-button admin-button--small admin-button--danger" disabled={saving || !item.id_request} onClick={() => runDisputeAction(item, 'cancel_request')}>Cancel request</button>
                  <button className="admin-button admin-button--small" disabled={saving || !item.id_request} onClick={() => runDisputeAction(item, 'resolve_request')}>Resolve</button>
                  <button className="admin-button admin-button--small" disabled={saving || item.case_status === 'resolved'} onClick={() => runDisputeAction(item, 'close_case')}>Close case</button>
                  <button className="admin-button admin-button--small admin-button--danger" disabled={saving || item.case_status === 'dismissed'} onClick={() => runDisputeAction(item, 'dismiss_case')}>Dismiss</button>
                </div>
              </div>
            </AdminCard>
          ))}
        </div>
        <div className="admin-pagination"><span>{disputePagination.total.toLocaleString()} records</span><div><button disabled={disputePagination.page <= 1} onClick={() => setDisputePagination((p) => ({ ...p, page: p.page - 1 }))}>Prev</button><span>Page {disputePagination.page} of {disputePagination.pages}</span><button disabled={disputePagination.page >= disputePagination.pages} onClick={() => setDisputePagination((p) => ({ ...p, page: p.page + 1 }))}>Next</button></div></div>
      </>}
    </>}

    {tab === 'penalties' && <>
      <FilterBar>
        <label className="admin-search-field"><span>Status</span><select value={penaltyStatus} onChange={(event) => { setPenaltyPagination((p) => ({ ...p, page: 1 })); setPenaltyStatus(event.target.value); }}><option value="all">All</option><option value="pending">Pending</option><option value="disputed">Disputed</option><option value="paid">Paid</option><option value="waived">Waived</option></select></label>
        <label className="admin-search-field"><span>Role</span><select value={penaltyRole} onChange={(event) => { setPenaltyPagination((p) => ({ ...p, page: 1 })); setPenaltyRole(event.target.value); }}><option value="all">All roles</option><option value="client">Client</option><option value="worker">Worker</option></select></label>
        <label className="admin-search-field"><span>Search</span><input maxLength={120} value={penaltySearch} placeholder="Penalty, request, email..." onChange={(event) => { setPenaltyPagination((p) => ({ ...p, page: 1 })); setPenaltySearch(event.target.value); }} /></label>
        <button className="admin-button" disabled={saving} onClick={createManualPenalty}><DollarSign size={15} />Create penalty</button>
      </FilterBar>
      {loading ? <AdminCard>Loading penalties...</AdminCard> : penalties.length === 0 ? <EmptyState title="No penalties found" description="Account debts and legal penalties will appear here." /> : <DataTable rows={penalties} rowKey={(item) => item.id_penalty} onRowClick={openPenaltyDetail} pagination={penaltyPagination} onPageChange={(page) => setPenaltyPagination((p) => ({ ...p, page }))} columns={[
        { key: 'account', label: 'Account', render: (item) => <div className="admin-primary-cell"><strong>{personName(item)}</strong><span>{item.user_email || `User #${item.id_user}`} - {item.actor_role}</span></div> },
        { key: 'reason', label: 'Reason', render: (item) => <div className="admin-primary-cell"><strong>{label(item.reason)}</strong><span>{item.description || item.service_name || `Request #${item.id_request || '-'}`}</span></div> },
        { key: 'amount', label: 'Amount', render: (item) => <div className="admin-primary-cell"><strong>{money(item.amount, item.currency_code)}</strong>{item.payment_method && <span>{label(item.payment_method)}{item.payment_reference ? ` - ${item.payment_reference}` : ''}</span>}</div> },
        { key: 'status', label: 'Status', render: (item) => <StatusBadge status={item.status} /> },
        { key: 'created', label: 'Created', render: (item) => dateLabel(item.created_at) },
        { key: 'actions', label: 'Actions', render: (item) => <div className="admin-action-row"><button className="admin-button admin-button--small admin-button--secondary" onClick={(event) => { event.stopPropagation(); openPenaltyDetail(item); }}><Eye size={13} />Detail</button><button className="admin-button admin-button--small admin-button--secondary" disabled={saving} onClick={(event) => { event.stopPropagation(); runPenaltyAction(item, 'edit'); }}>Edit amount</button><button className="admin-button admin-button--small" disabled={saving || item.status === 'paid'} onClick={(event) => { event.stopPropagation(); runPenaltyAction(item, 'mark_paid'); }}>Paid</button><button className="admin-button admin-button--small admin-button--secondary" disabled={saving || item.status === 'waived'} onClick={(event) => { event.stopPropagation(); runPenaltyAction(item, 'waive'); }}>Waive</button><button className="admin-button admin-button--small admin-button--danger" disabled={saving || item.status === 'disputed'} onClick={(event) => { event.stopPropagation(); runPenaltyAction(item, 'dispute'); }}>Dispute</button></div> },
      ]} />}
    </>}

    {tab === 'uploads' && <>
      <FilterBar>
        <label className="admin-search-field"><span>Queue</span><select value={reviewDecision} onChange={(event) => { setReviewPagination((p) => ({ ...p, page: 1 })); setReviewDecision(event.target.value); }}><option value="pending">Needs review ({reviewSummary.pending_count})</option><option value="resolved_month">Resolved this month ({reviewSummary.resolved_month_count})</option><option value="resolved">All resolved ({reviewSummary.resolved_count})</option><option value="all">All records</option><option value="review">AI review</option><option value="block">Blocked</option><option value="allow">Approved</option><option value="skipped">Skipped</option></select></label>
        <label className="admin-search-field"><span>Provider</span><select value={reviewProvider} onChange={(event) => { setReviewPagination((p) => ({ ...p, page: 1 })); setReviewProvider(event.target.value); }}><option value="all">All providers</option><option value="openai">OpenAI</option><option value="local">Local</option><option value="none">None</option></select></label>
        <label className="admin-search-field"><span>Search</span><input maxLength={120} value={reviewSearch} placeholder="User, email, file, request..." onChange={(event) => { setReviewPagination((p) => ({ ...p, page: 1 })); setReviewSearch(event.target.value); }} /></label>
        <button className="admin-button admin-button--secondary" disabled={saving} onClick={approveSafeSkipped}>Approve safe skipped</button>
      </FilterBar>
      {loading ? <AdminCard>Loading upload moderation...</AdminCard> : reviews.length === 0 ? <EmptyState title="No upload reviews" description="AI, OCR and local moderation decisions appear here." /> : <>
        <div className="grid gap-4 xl:grid-cols-2">
          {reviews.map((item) => {
            const isFinalized = Boolean(item.reviewed_at);
            return <AdminCard key={item.id_review} className={`overflow-hidden ${isFinalized ? 'opacity-90' : ''}`}>
            <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
              <div className="flex min-h-[150px] items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-slate-950/40">
                {item.file_url && !brokenReviewImages[item.id_review] ? (
                  <img
                    src={item.file_url}
                    alt={item.original_file_name || `Moderation review ${item.id_review}`}
                    className="h-full max-h-[220px] w-full object-cover"
                    onError={() => setBrokenReviewImages((current) => ({ ...current, [item.id_review]: true }))}
                  />
                ) : (
                  <div className="flex h-full min-h-[220px] w-full flex-col items-center justify-center gap-2 bg-slate-950/5 p-4 text-center dark:bg-white/5">
                    <ImageOff className="h-8 w-8 text-slate-400" />
                    <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                      Preview unavailable
                    </span>
                    <small className="max-w-[150px] text-[11px] font-bold leading-4 text-slate-500">
                      Older blocked files may have been removed before review storage was enabled.
                    </small>
                  </div>
                )}
              </div>
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3"><div className="admin-primary-cell"><strong>Review #{item.id_review}</strong><span>{item.original_file_name || item.file_name}</span>{isFinalized && <small className="admin-muted">Closed {dateLabel(item.reviewed_at)}</small>}</div><StatusBadge status={isFinalized ? `closed_${item.decision}` : item.decision} /></div>
                <div className="admin-primary-cell"><strong>{personName(item)}</strong><span>{item.user_email || 'No account'} - {item.user_role || 'unknown'} - {item.upload_field || 'upload'}</span></div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-white/70 p-3 dark:border-white/10 dark:bg-white/5"><p className="admin-eyebrow">Risk</p><strong>{item.risk_type || (item.flagged ? 'flagged' : 'none')}</strong></div>
                  <div className="rounded-2xl border border-slate-200 bg-white/70 p-3 dark:border-white/10 dark:bg-white/5"><p className="admin-eyebrow">Provider</p><strong>{item.provider}</strong></div>
                  <div className="rounded-2xl border border-slate-200 bg-white/70 p-3 dark:border-white/10 dark:bg-white/5"><p className="admin-eyebrow">Repeat flags</p><strong>{Number(item.user_moderation_incidents || 0) + Number(item.user_content_penalties || 0)}</strong></div>
                </div>
                <p className="admin-muted">{item.reason || item.service_name || `Request #${item.id_request || '-'}`}</p>
                <div className="admin-action-row">
                  {item.file_url && !brokenReviewImages[item.id_review] && <a className="admin-button admin-button--small admin-button--secondary" href={item.file_url} target="_blank" rel="noreferrer">Open image</a>}
                  {isFinalized ? (
                    <span className={`rounded-full border px-3 py-2 text-xs font-black uppercase tracking-[0.12em] ${item.decision === 'allow' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-700 dark:border-white/10 dark:bg-white/10 dark:text-slate-200'}`}>
                      {item.decision === 'allow' ? 'Approved and cleared' : 'Closed in history'}
                    </span>
                  ) : (
                    <>
                      <button className="admin-button admin-button--small" disabled={saving} onClick={() => runReviewAction(item, 'approve')}><CheckCircle2 size={13} />Approve</button>
                      <button className="admin-button admin-button--small admin-button--danger" disabled={saving} onClick={() => runReviewAction(item, 'block')}><Ban size={13} />Block</button>
                      <button className="admin-button admin-button--small admin-button--secondary" disabled={saving || !item.id_user} onClick={() => runReviewAction(item, 'create_penalty')}><DollarSign size={13} />Penalty</button>
                      <button className="admin-button admin-button--small admin-button--danger" disabled={saving || !item.id_user} onClick={() => runReviewAction(item, 'suspend_user')}><UserX size={13} />Suspend</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </AdminCard>;
          })}
        </div>
        <div className="admin-pagination"><span>{reviewPagination.total.toLocaleString()} records</span><div><button disabled={reviewPagination.page <= 1} onClick={() => setReviewPagination((p) => ({ ...p, page: p.page - 1 }))}>Prev</button><span>Page {reviewPagination.page} of {reviewPagination.pages}</span><button disabled={reviewPagination.page >= reviewPagination.pages} onClick={() => setReviewPagination((p) => ({ ...p, page: p.page + 1 }))}>Next</button></div></div>
      </>}
    </>}

    <DetailDrawer open={!!caseEvidence} title={caseEvidence ? `Case evidence #${caseEvidence.id_incident}` : 'Case evidence'} subtitle={caseEvidence ? `Captured ${dateLabel(caseEvidence.created_at)}` : undefined} onClose={() => setCaseEvidence(null)}>
      {caseEvidence && <div className="space-y-4">
        <AdminCard>
          <p className="admin-section-title">Case snapshot</p>
          <div className="admin-detail-grid">
            <p><strong>Incident</strong><span>{label(caseEvidence.incident_type)}</span></p>
            <p><strong>Actor</strong><span>{label(caseEvidence.actor_role)}</span></p>
            <p><strong>Request</strong><span>{caseEvidence.id_request ? `#${caseEvidence.id_request}` : 'No request'}</span></p>
            <p><strong>Captured at</strong><span>{dateLabel(caseEvidence.created_at)}</span></p>
          </div>
        </AdminCard>

        <AdminCard>
          <p className="admin-section-title">Request state</p>
          <div className="admin-primary-cell">
            <strong>{caseEvidence.snapshot?.request?.service_name || `Request #${caseEvidence.id_request || '-'}`}</strong>
            <span>{label(caseEvidence.snapshot?.request?.status || 'unknown')} - {caseEvidence.snapshot?.request?.location_text || 'No location'}</span>
            <span>{caseEvidence.snapshot?.request?.description || 'No request description'}</span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 p-3 dark:border-white/10"><p className="admin-eyebrow">Booking</p><strong>{label(caseEvidence.snapshot?.request?.booking_type || 'express')}</strong></div>
            <div className="rounded-2xl border border-slate-200 p-3 dark:border-white/10"><p className="admin-eyebrow">Budget</p><strong>{money(caseEvidence.snapshot?.request?.final_budget || caseEvidence.snapshot?.request?.budget || 0)}</strong></div>
            <div className="rounded-2xl border border-slate-200 p-3 dark:border-white/10"><p className="admin-eyebrow">Payment</p><strong>{label(caseEvidence.snapshot?.payment?.payment_status || 'none')}</strong></div>
          </div>
        </AdminCard>

        <AdminCard>
          <p className="admin-section-title">Before and after</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
              <p className="admin-eyebrow">Before</p>
              <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap rounded-2xl bg-white p-3 text-xs font-semibold text-slate-700 dark:bg-slate-950 dark:text-slate-200">{JSON.stringify(caseEvidence.snapshot?.before || {}, null, 2)}</pre>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
              <p className="admin-eyebrow">After / metadata</p>
              <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap rounded-2xl bg-white p-3 text-xs font-semibold text-slate-700 dark:bg-slate-950 dark:text-slate-200">{JSON.stringify({ after: caseEvidence.snapshot?.after || {}, metadata: caseEvidence.snapshot?.metadata || {} }, null, 2)}</pre>
            </div>
          </div>
        </AdminCard>

        <AdminCard>
          <p className="admin-section-title">Timeline</p>
          <div className="space-y-2">
            {[
              ['Request created', caseEvidence.snapshot?.request?.created_at],
              ['Scheduled visit', caseEvidence.snapshot?.lifecycle?.scheduled_start_time],
              ['Worker assigned', caseEvidence.snapshot?.lifecycle?.assigned_at],
              ['Route started', caseEvidence.snapshot?.lifecycle?.route_started_at],
              ['Worker arrived', caseEvidence.snapshot?.lifecycle?.worker_arrived_at],
              ['Work started', caseEvidence.snapshot?.lifecycle?.work_started_at],
              ['Work finished', caseEvidence.snapshot?.lifecycle?.work_finished_at],
              ['Completed', caseEvidence.snapshot?.lifecycle?.completed_at],
              ['Incident captured', caseEvidence.snapshot?.captured_at],
            ].map(([title, value]) => (
              <div key={title as string} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-3 dark:border-white/10">
                <div className="admin-primary-cell"><strong>{title}</strong><span>{value ? dateLabel(String(value)) : 'Not recorded'}</span></div>
                <StatusBadge status={value ? 'done' : 'pending'} />
              </div>
            ))}
          </div>
        </AdminCard>

        <AdminCard>
          <p className="admin-section-title">Admin notes</p>
          {(caseEvidence.notes || []).length === 0 ? <p className="admin-muted">No internal notes recorded yet.</p> : <div className="space-y-2">
            {(caseEvidence.notes || []).map((note) => (
              <div key={note.id_note} className="rounded-2xl border border-slate-200 p-3 dark:border-white/10">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{label(note.note_type)}</strong>
                  <small>{dateLabel(note.created_at)}</small>
                </div>
                <p className="admin-muted mt-1">{note.note}</p>
                <small className="admin-muted">{`${note.admin_name || ''} ${note.admin_lastname || ''}`.trim() || note.admin_email || 'System'}</small>
              </div>
            ))}
          </div>}
        </AdminCard>

        <AdminCard>
          <p className="admin-section-title">People</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-3 dark:border-white/10">
              <p className="admin-eyebrow">Client</p>
              <strong>{caseEvidence.snapshot?.client?.name || 'No client'}</strong>
              <p className="admin-muted">{caseEvidence.snapshot?.client?.email || 'No email'}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-3 dark:border-white/10">
              <p className="admin-eyebrow">Worker</p>
              <strong>{caseEvidence.snapshot?.worker?.name || 'No worker'}</strong>
              <p className="admin-muted">{caseEvidence.snapshot?.worker?.email || 'No email'}{caseEvidence.snapshot?.worker?.distance_to_destination_km != null ? ` - ${caseEvidence.snapshot.worker.distance_to_destination_km} km from job` : ''}</p>
            </div>
          </div>
        </AdminCard>

        <AdminCard>
          <p className="admin-section-title">Chat transcript</p>
          {(caseEvidence.snapshot?.chat_messages || []).length === 0 ? <p className="admin-muted">No chat messages captured.</p> : <div className="space-y-2">
            {(caseEvidence.snapshot?.chat_messages || []).map((message: any) => (
              <div key={message.id_message} className="rounded-2xl border border-slate-200 p-3 dark:border-white/10">
                <div className="flex flex-wrap items-center justify-between gap-2"><strong>{label(message.sender_role || 'message')}</strong><small>{dateLabel(message.created_at)}</small></div>
                <p className="admin-muted mt-1">{message.message || 'Image only'}</p>
                {message.image_url && <a className="admin-button admin-button--small admin-button--secondary mt-2" href={message.image_url} target="_blank" rel="noreferrer">Open image</a>}
              </div>
            ))}
          </div>}
        </AdminCard>

        <AdminCard>
          <p className="admin-section-title">Reports</p>
          {(caseEvidence.snapshot?.reports || []).length === 0 ? <p className="admin-muted">No reports captured.</p> : <div className="space-y-2">
            {(caseEvidence.snapshot?.reports || []).map((report: any) => (
              <div key={report.id_report} className="rounded-2xl border border-slate-200 p-3 dark:border-white/10">
                <div className="flex flex-wrap items-center justify-between gap-2"><strong>{label(report.reason || 'report')}</strong><StatusBadge status={report.status || 'open'} /></div>
                <p className="admin-muted mt-1">{report.description || 'No description'}</p>
                {report.evidence_image_url && <a className="admin-button admin-button--small admin-button--secondary mt-2" href={report.evidence_image_url} target="_blank" rel="noreferrer">Open evidence</a>}
              </div>
            ))}
          </div>}
        </AdminCard>

        <AdminCard>
          <p className="admin-section-title">Request photos</p>
          {(caseEvidence.snapshot?.request_images || []).length === 0 ? <p className="admin-muted">No request photos captured.</p> : <div className="grid grid-cols-2 gap-3">
            {(caseEvidence.snapshot?.request_images || []).map((image: any) => image.url ? <a key={image.id_image} href={image.url} target="_blank" rel="noreferrer"><img src={image.url} alt="" className="h-32 w-full rounded-2xl object-cover" /></a> : null)}
          </div>}
        </AdminCard>

        <AdminCard>
          <p className="admin-section-title">Candidate workers</p>
          {(caseEvidence.snapshot?.candidates || []).length === 0 ? <p className="admin-muted">No candidate rows captured.</p> : <div className="space-y-2">
            {(caseEvidence.snapshot?.candidates || []).map((candidate: any) => (
              <div key={`${candidate.id_worker_profile}-${candidate.updated_at}`} className="admin-primary-cell">
                <strong>Worker profile #{candidate.id_worker_profile}</strong>
                <span>{label(candidate.status || 'unknown')} - {candidate.distance_km != null ? `${candidate.distance_km} km` : 'No distance'}{candidate.proposed_budget != null ? ` - ${money(candidate.proposed_budget)}` : ''}</span>
              </div>
            ))}
          </div>}
        </AdminCard>
      </div>}
    </DetailDrawer>

    <DetailDrawer open={!!detail} title={detail ? `Penalty #${detail.penalty.id_penalty}` : 'Penalty detail'} subtitle={detail ? `${personName(detail.penalty)} - ${money(detail.penalty.amount, detail.penalty.currency_code)}` : undefined} onClose={() => setDetail(null)}>
      {detail && <div className="space-y-4">
        <AdminCard>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="admin-section-title">Penalty summary</p>
              <p className="admin-muted">Manual decisions, payment status and account actions for this penalty.</p>
            </div>
            <StatusBadge status={detail.penalty.status} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5">
              <p className="admin-eyebrow">Amount</p>
              <strong className="text-2xl">{money(detail.penalty.amount, detail.penalty.currency_code)}</strong>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5">
              <p className="admin-eyebrow">Reason</p>
              <strong>{label(detail.penalty.reason)}</strong>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5">
              <p className="admin-eyebrow">Created by</p>
              <strong>{`${detail.penalty.creator_name || ''} ${detail.penalty.creator_lastname || ''}`.trim() || detail.penalty.creator_email || 'System'}</strong>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5">
              <p className="admin-eyebrow">Request</p>
              <strong>{detail.penalty.id_request ? `#${detail.penalty.id_request}` : 'Not linked'}</strong>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-950/40">
            <p className="admin-eyebrow">Admin description</p>
            <p className="mt-2 text-sm font-bold text-slate-700 dark:text-slate-200">{detail.penalty.description || 'No description'}</p>
          </div>
          {(detail.penalty.payment_method || detail.penalty.payment_reference) && (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
              <p className="admin-eyebrow">Payment record</p>
              <strong>{label(detail.penalty.payment_method || 'support_adjustment')}</strong>
              {detail.penalty.payment_reference && <p className="mt-1 text-sm font-semibold">{detail.penalty.payment_reference}</p>}
            </div>
          )}
          <div className="admin-action-row mt-4">
            <button className="admin-button admin-button--small admin-button--secondary" disabled={saving} onClick={() => runPenaltyAction(detail.penalty, 'edit')}>Edit amount</button>
            <button className="admin-button admin-button--small" disabled={saving || detail.penalty.status === 'paid'} onClick={() => runPenaltyAction(detail.penalty, 'mark_paid')}>Mark paid</button>
            <button className="admin-button admin-button--small admin-button--secondary" disabled={saving || detail.penalty.status === 'waived'} onClick={() => runPenaltyAction(detail.penalty, 'waive')}>Waive</button>
            <button className="admin-button admin-button--small admin-button--danger" disabled={saving || detail.penalty.status === 'disputed'} onClick={() => runPenaltyAction(detail.penalty, 'dispute')}>Dispute</button>
            <button className="admin-button admin-button--small admin-button--secondary" disabled={saving} onClick={() => runPenaltyAction(detail.penalty, 'clear_restrictions')}>Clear restrictions</button>
          </div>
        </AdminCard>
        {detail.request && <AdminCard><p className="admin-section-title">Request history</p><div className="admin-primary-cell"><strong>{detail.request.service_name || `Request #${detail.request.id_request}`}</strong><span>{detail.request.status || 'Unknown'} - {detail.request.location_text || 'No location'}</span><span>{detail.request.description || 'No request description'}</span></div></AdminCard>}
        <AdminCard><p className="admin-section-title">Evidence and reports</p>{detail.reports.length === 0 ? <p className="admin-muted">No reports linked.</p> : <div className="space-y-3">{detail.reports.map((report) => <div key={report.id_report} className="rounded-2xl border border-slate-200 p-3 dark:border-white/10"><div className="flex items-center justify-between gap-3"><strong>{label(report.reason)}</strong><StatusBadge status={report.status} /></div><p className="admin-muted">{report.description}</p>{report.evidence_image_url && <a className="admin-button admin-button--small admin-button--secondary mt-2" href={report.evidence_image_url} target="_blank" rel="noreferrer">Open evidence</a>}</div>)}</div>}</AdminCard>
        <AdminCard><p className="admin-section-title">Uploaded files</p>{detail.images.length === 0 ? <p className="admin-muted">No request images.</p> : <div className="grid grid-cols-2 gap-3">{detail.images.map((image) => image.url && <a key={image.id_image} href={image.url} target="_blank" rel="noreferrer"><img src={image.url} alt="" className="h-32 w-full rounded-2xl object-cover" /></a>)}</div>}</AdminCard>
        <AdminCard><p className="admin-section-title">Chat transcript</p>{detail.messages.length === 0 ? <p className="admin-muted">No chat messages.</p> : <div className="space-y-2">{detail.messages.map((message) => <div key={message.id_message} className="rounded-2xl border border-slate-200 p-3 dark:border-white/10"><strong>{message.sender_role}</strong><p className="admin-muted">{message.message || 'Image only'}</p>{message.image_url && <a className="admin-button admin-button--small admin-button--secondary" href={message.image_url} target="_blank" rel="noreferrer">Open image</a>}</div>)}</div>}</AdminCard>
        <AdminCard><p className="admin-section-title">Moderation reviews</p>{detail.moderation_reviews.length === 0 ? <p className="admin-muted">No moderation rows.</p> : <div className="space-y-2">{detail.moderation_reviews.map((item) => <div key={item.id_review} className="admin-primary-cell"><strong>Review #{item.id_review}</strong><span>{item.decision} - {item.reason || item.risk_type || 'No risk'}</span></div>)}</div>}</AdminCard>
        <AdminCard>
          <p className="admin-section-title">Appeals and disputes</p>
          {detail.appeals.length === 0 ? <p className="admin-muted">No appeal submitted for this penalty.</p> : (
            <div className="space-y-3">
              {detail.appeals.map((appeal) => (
                <div key={appeal.id_appeal} className="rounded-2xl border border-slate-200 p-3 dark:border-white/10">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="admin-primary-cell">
                      <strong>Appeal #{appeal.id_appeal}</strong>
                      <span>{dateLabel(appeal.created_at)}</span>
                    </div>
                    <StatusBadge status={appeal.status} />
                  </div>
                  <p className="admin-muted mt-2">{appeal.explanation}</p>
                  {(appeal.evidence_urls?.length || appeal.evidence.length) > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(appeal.evidence_urls?.length ? appeal.evidence_urls : appeal.evidence).map((item, index) => (
                        item ? <a key={`${item}-${index}`} href={item} target="_blank" rel="noreferrer" className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-200">
                          Evidence {index + 1}
                        </a> : null
                      ))}
                    </div>
                  )}
                  {appeal.admin_note && <p className="admin-muted mt-2">Admin note: {appeal.admin_note}</p>}
                  <div className="admin-action-row mt-3">
                    <button className="admin-button admin-button--small" disabled={saving} onClick={() => runAppealAction(appeal, { status: 'accepted', penalty_action: 'waive' })}>Accept & waive</button>
                    <button className="admin-button admin-button--small admin-button--secondary" disabled={saving} onClick={() => runAppealAction(appeal, { status: 'rejected', penalty_action: 'keep' })}>Keep penalty</button>
                    <button className="admin-button admin-button--small admin-button--secondary" disabled={saving} onClick={() => runAppealAction(appeal, { status: 'accepted', penalty_action: 'reduce' })}>Reduce amount</button>
                    <button className="admin-button admin-button--small admin-button--secondary" disabled={saving} onClick={() => runAppealAction(appeal, { status: 'needs_more_info', penalty_action: 'none' })}>Need info</button>
                    <button className="admin-button admin-button--small admin-button--danger" disabled={saving} onClick={() => runAppealAction(appeal, { status: 'rejected', penalty_action: 'suspend' })}>Suspend</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </AdminCard>
        <AdminCard><p className="admin-section-title">Behavior history</p>{!detail.enforcement || detail.enforcement.incidents.length === 0 ? <p className="admin-muted">No behavior incidents recorded.</p> : <div className="space-y-3"><div className="grid gap-2 sm:grid-cols-4"><div className="rounded-2xl border border-slate-200 p-3 dark:border-white/10"><p className="admin-eyebrow">Trust score</p><strong>{detail.enforcement.trust_score ?? 100}/100</strong></div><div className="rounded-2xl border border-slate-200 p-3 dark:border-white/10"><p className="admin-eyebrow">Standing</p><strong>{label(detail.enforcement.standing || 'good_standing')}</strong></div><div className="rounded-2xl border border-slate-200 p-3 dark:border-white/10"><p className="admin-eyebrow">Total incidents</p><strong>{detail.enforcement.incident_count}</strong></div><div className="rounded-2xl border border-slate-200 p-3 dark:border-white/10"><p className="admin-eyebrow">Active restrictions</p><strong>{detail.enforcement.active_restrictions.length}</strong></div></div>{detail.enforcement.active_restrictions.length > 0 && <button className="admin-button admin-button--secondary" disabled={saving} onClick={() => runPenaltyAction(detail.penalty, 'clear_restrictions')}>Clear active restrictions</button>}{detail.enforcement.active_restrictions.map((restriction) => <div key={restriction.id_restriction} className="rounded-2xl border border-red-200 bg-red-50 p-3 text-red-900"><strong>{label(restriction.restriction_type)}</strong><p className="text-sm font-semibold">{restriction.reason}</p><small>{restriction.ends_at ? `Ends ${dateLabel(restriction.ends_at)}` : 'Admin review required'}</small></div>)}{detail.enforcement.incidents.slice(0, 8).map((incident) => <div key={incident.id_incident} className="admin-primary-cell"><strong>{label(incident.incident_type)} - {label(incident.action_taken)}</strong><span>{incident.description || `${incident.severity} incident`}</span><small>{dateLabel(incident.created_at)}</small></div>)}</div>}</AdminCard>
        <AdminCard><p className="admin-section-title">Admin activity</p>{detail.activity.length === 0 ? <p className="admin-muted">No admin changes yet.</p> : <div className="space-y-2">{detail.activity.map((item) => <div key={item.id_activity} className="admin-primary-cell"><strong>{label(item.action_type)}</strong><span>{item.summary}</span><small>{dateLabel(item.created_at)}</small></div>)}</div>}</AdminCard>
      </div>}
    </DetailDrawer>
  </div>;
}
