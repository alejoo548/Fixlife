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
