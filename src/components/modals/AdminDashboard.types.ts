export interface AdminDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface Service {
  id_service: number;
  name: string;
  description: string | null;
  icon: string | null;
  is_active: boolean | number;
  created_at: string;
}

export interface ServiceCard {
  id_card: number;
  id_service: number;
  image_url: string | null;
  badge: string | null;
  headline: string | null;
  summary: string | null;
  cta_label: string | null;
  sort_order: number;
  is_active: boolean | number;
  created_at: string;
  service_name: string;
  service_icon: string | null;
}

export interface PendingWorker {
  id_user: number;
  name: string;
  lastname: string;
  email: string;
  phone_number: string;
  username: string | null;
  profile_image: string | null;
  created_at: string;
  id_worker_profile: number;
  dui_document: string | null;
  cert_document: string | null;
  dui_document_url: string | null;
  cert_document_url: string | null;
  is_verified: number;
  services: { id_service: number; name: string }[];
}

export interface AdminUser {
  id_user: number;
  name: string;
  lastname: string;
  email: string;
  phone_number: string | null;
  username: string | null;
  profile_image: string | null;
  rol: string;
  created_at: string;
  last_login: string | null;
  is_active: number | boolean;
  id_worker_profile?: number | null;
  is_verified?: number | boolean | null;
  membership_tier?: 'standard' | 'verified' | 'premium' | 'elite' | string | null;
}

export interface AdminRequestHistoryItem {
  id_request: number;
  id_user: number | null;
  id_service: number;
  service_name: string;
  description: string;
  location_text: string;
  budget: number;
  radius_km: number;
  status: 'pending' | 'assigned' | 'in_progress' | 'done' | 'cancelled' | string;
  created_at: string;
  images_count: number;
  client: { id_user: number; name: string; email: string | null } | null;
  assigned_worker: { id_worker_profile: number; name: string } | null;
}

export interface AdminWorkerRewardsSettings {
  trial_min_completed_jobs: number;
  commission_rate: number;
  royalty_rate: number;
  royalty_min_jobs: number;
  royalty_min_completion_rate: number;
  payout_weekday: number;
}

export interface AdminWorkerRewardsPayout {
  id_bonus_payout: number;
  id_worker_profile: number;
  id_user: number | null;
  worker_name: string;
  bonus_type: 'commission' | 'royalty' | string;
  cycle_key: string;
  base_amount: number;
  bonus_amount: number;
  payout_status: 'scheduled' | 'paid' | 'cancelled' | string;
  scheduled_for: string;
  paid_at: string | null;
  notes: string | null;
  source_request_id: number | null;
  location_text: string | null;
  service_name: string | null;
}

export interface AdminCommissionServiceOverride {
  id_rule: number;
  id_service: number;
  service_name: string | null;
  rate_percent: number;
  is_active: boolean;
  priority: number;
  adjustment_mode: 'set_rate' | 'add_rate' | 'subtract_rate';
}

export interface AdminCommissionAdjustmentItem {
  id_rule: number;
  rate_percent: number;
  is_active: boolean;
  priority: number;
  adjustment_mode: 'set_rate' | 'add_rate' | 'subtract_rate';
}

export interface AdminCommissionUrgencyAdjustment extends AdminCommissionAdjustmentItem {
  urgency_level: 'standard' | 'urgent' | 'emergency';
}

export interface AdminCommissionTierAdjustment extends AdminCommissionAdjustmentItem {
  worker_tier: 'standard' | 'verified' | 'premium' | 'elite';
}

export interface AdminCommissionPromoRule extends AdminCommissionAdjustmentItem {
  promo_code: string;
}

export interface AdminCommissionConfig {
  global_rate_percent: number;
  service_overrides: AdminCommissionServiceOverride[];
  urgency_adjustments: AdminCommissionUrgencyAdjustment[];
  worker_tier_adjustments: AdminCommissionTierAdjustment[];
  promo_codes: AdminCommissionPromoRule[];
  summary: {
    effective_default_rate_percent: number;
    service_override_count: number;
    urgency_rule_count: number;
    worker_tier_rule_count: number;
    promo_rule_count: number;
  };
}

export interface AdminWorkerPayout {
  id_worker_payout: number;
  id_worker_profile: number;
  id_user: number | null;
  id_request: number | null;
  id_payment: number | null;
  worker_name: string;
  gross_amount: number;
  platform_fee: number;
  net_amount: number;
  payout_status: 'scheduled' | 'paid' | 'cancelled' | string;
  scheduled_for: string;
  paid_at: string | null;
  notes: string | null;
  location_text: string | null;
  service_name: string | null;
}

export interface AdminPaymentLedgerItem {
  id_ledger_entry: number;
  id_request: number | null;
  id_payment: number | null;
  id_worker_profile: number | null;
  id_worker_payout: number | null;
  entry_key: string;
  entry_type: string;
  amount: number;
  currency_code: string;
  entry_status: string;
  available_on: string | null;
  metadata_json: string | null;
  created_at: string;
  location_text: string | null;
  service_name: string | null;
}

export interface AdminFinanceReport {
  range: {
    from: string;
    to: string;
    days: number;
  };
  summary: {
    ledger_rows: number;
    gross_volume: number;
    platform_revenue: number;
    worker_escrow: number;
    worker_released: number;
    worker_paid: number;
    bonus_paid: number;
    scheduled_settlement_total: number;
    invoice_count: number;
  };
  service_breakdown: Array<{
    service_name: string;
    gross_volume: number;
    platform_revenue: number;
    settled_payouts: number;
    invoices: number;
  }>;
  invoices: Array<{
    invoice_number: string;
    id_request: number;
    id_payment: number;
    paid_at: string;
    service_name: string;
    location_text: string | null;
    urgency_level: string;
    customer_name: string;
    customer_email: string | null;
    provider: string;
    checkout_reference: string | null;
    amount: number;
    platform_fee: number;
    worker_payout: number;
    currency_code: string;
    commission_rate_percent: number;
    promo_code: string | null;
    policy_label: string | null;
  }>;
}

export interface AdminWorkerTierBenefit {
  tier: 'standard' | 'verified' | 'premium' | 'elite';
  priority_weight: number;
  featured_profile_boost: number;
  max_active_leads: number;
  support_level: string;
  badge_label: string;
  monthly_fee: number;
  benefits_summary: string | null;
  updated_at?: string | null;
}

export interface AdminWorkerTierHistoryItem {
  id_history: number;
  id_worker_profile: number;
  previous_tier: string | null;
  next_tier: string;
  reason: string | null;
  changed_by_user_id: number | null;
  changed_by_name: string | null;
  worker_name: string;
  created_at: string;
}

export interface AdminFinanceCase {
  id_case: number;
  case_type: 'refund' | 'dispute' | 'adjustment' | string;
  case_status: 'open' | 'resolved' | 'cancelled' | string;
  direction: string;
  id_request: number | null;
  id_payment: number | null;
  amount: number;
  currency_code: string;
  reason: string | null;
  notes: string | null;
  created_by_user_id: number | null;
  resolved_by_user_id: number | null;
  created_at: string;
  resolved_at: string | null;
  service_name: string | null;
  location_text: string | null;
}

export interface AdminFinanceClosureReport {
  range: {
    from: string;
    to: string;
    period: 'weekly' | 'monthly' | string;
  };
  summary: {
    gross_volume: number;
    platform_fee: number;
    adjustments_total: number;
    worker_settlement_total: number;
    net_platform: number;
    discrepancy_count: number;
    open_case_count: number;
  };
  periods: Array<{
    period_key: string;
    gross_volume: number;
    platform_fee: number;
    adjustments_total: number;
    worker_settlement_total: number;
    net_platform: number;
  }>;
  discrepancies: Array<{
    id_payment: number;
    id_request: number;
    expected_amount: number;
    expected_platform_fee: number;
    expected_worker_payout: number;
    ledger_customer_charge: number;
    ledger_platform_fee: number;
    ledger_worker_release: number;
  }>;
}

export interface AdminSystemEvent {
  id_event: number;
  level: 'info' | 'warning' | 'error' | 'critical' | string;
  component: string;
  event_type: string;
  message: string;
  metadata_json: string | null;
  created_at: string;
}

export interface AdminBackgroundJob {
  id_job: number;
  job_key: string | null;
  job_type: string;
  status: string;
  attempts_made: number;
  attempts_max: number;
  run_after: string;
  completed_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminActivityItem {
  id_activity: number;
  action: string;
  entity: string;
  entity_id: number | null;
  summary: string;
  created_at: string;
  admin: { id_user: number; name: string; email: string | null } | null;
  metadata: any;
}
