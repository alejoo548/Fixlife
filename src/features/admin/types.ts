export type AdminRequestStatus =
  | 'pending' | 'payment_pending' | 'paid' | 'assigned' | 'in_progress'
  | 'awaiting_confirmation' | 'done' | 'cancelled' | string;

export interface AdminRequestListItem {
  id_request: number;
  id_user: number | null;
  id_service: number;
  service_name: string;
  description: string;
  location_text: string;
  latitude: number | null;
  longitude: number | null;
  budget: number;
  radius_km: number;
  status: AdminRequestStatus;
  payment_status: string;
  payment_amount: number | null;
  created_at: string;
  updated_at: string;
  images_count: number;
  proposed_budget: number | null;
  counter_message: string | null;
  client: { id_user: number; name: string; email: string | null } | null;
  assigned_worker: { id_worker_profile: number; name: string } | null;
}

export interface AdminRequestDetail extends AdminRequestListItem {
  initial_budget: number | null;
  final_budget: number | null;
  assigned_at: string | null;
  client: { id_user: number; name: string; email: string | null; phone: string | null } | null;
  assigned_worker: { id_worker_profile: number; name: string; email: string | null; phone: string | null } | null;
  offer: { proposed_budget: number | null; counter_message: string | null; counter_status: string | null };
  payment: null | { id_payment: number; provider: string; checkout_reference: string; currency_code: string; amount: number; platform_fee: number; worker_payout: number; status: string; paid_at: string | null; released_at: string | null };
  rating: null | { punctuality: number; quality: number; price_fairness: number; comment: string | null; created_at: string };
  images: Array<{ id_image: number; url: string | null; created_at: string }>;
  messages: Array<{ id_message: number; sender_role: string; message: string | null; image_url: string | null; created_at: string }>;
  worker_responses: Array<Record<string, unknown>>;
}

export interface Pagination { page: number; limit: number; total: number; pages: number }

export interface AdminStats {
  total_users: number;
  total_pros: number;
  total_admins: number;
  pending_pros: number;
  total_services: number;
  serviceCategoryStats: Array<{ name: string; value: number }>;
  completedServicesWeekly: Array<{ name: string; value: number }>;
  completedServicesPrevTotal: number;
  popularLocations: Array<{ name: string; value: number }>;
  revenueData: Array<{ name: string; uv: number; pv: number }>;
  trafficData: Array<{ name: string; Users: number; Pros: number; Admins?: number }>;
  request_health: { created: number; assigned: number; paid: number; completed: number; cancelled: number; cancellation_rate: number; avg_assignment_minutes: number | null };
}

export interface AdminUserDetail {
  id_user: number;
  name: string;
  email: string;
  phone_number: string | null;
  username: string | null;
  profile_image: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  last_login: string | null;
  professional: null | {
    id_worker_profile: number;
    bio: string | null;
    is_verified: number;
    membership_tier: string;
    dui_document_url: string | null;
    cert_document_url: string | null;
    services: Array<{ id_service: number; name: string }>;
    rating: { count: number; average: number | null; punctuality: number | null; quality: number | null; price: number | null };
  };
  summary: { request_count: number; completed_count: number; cancelled_count: number; paid_volume: number };
  requests: Array<{ id_request: number; service_name: string; status: string; description: string; location_text: string; budget: number; payment_status: string; payment_amount: number | null; created_at: string; updated_at: string }>;
  admin_activity: Array<{ id_activity: number; action: string; entity: string; summary: string; metadata: unknown; created_at: string }>;
}
