export interface RequestsViewProps {
  isOnline: boolean | null;
  mobileView: 'list' | 'map';
  token: string | null;
  isVerified?: boolean;
  isDark?: boolean;
}

export interface WorkerRequest {
  id_request: number;
  id_service: number;
  service_name: string;
  service_icon: string | null;
  description: string;
  location_text: string;
  latitude: number | null;
  longitude: number | null;
  budget: number;
  booking_type?: 'express' | 'scheduled' | string;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  scheduled_start_time?: string | null;
  scheduled_end_time?: string | null;
  worker_arrived_at?: string | null;
  workflow_version?: number;
  client_approved_at?: string | null;
  route_started_at?: string | null;
  work_started_at?: string | null;
  work_finished_at?: string | null;
  completed_at?: string | null;
  approvals?: {
    start_work: { client: boolean; worker: boolean };
    finish_work: { client: boolean; worker: boolean };
    complete_service: { client: boolean; worker: boolean };
  };
  request_status:
    | 'open'
    | 'payment_pending'
    | 'paid'
    | 'assigned'
    | 'route_in_progress'
    | 'arrived'
    | 'start_pending'
    | 'in_progress'
    | 'finish_pending'
    | 'awaiting_confirmation'
    | 'completion_pending'
    | 'done'
    | 'cancelled';
  worker_status: 'new' | 'accepted' | 'rejected' | 'expired';
  distance_km: number | null;
  created_at: string;
  route_url: string | null;
  proposed_budget?: number | null;
  counter_message?: string | null;
  images?: Array<{ file_name: string; url: string }>;
  client?: {
    id_user: number;
    name: string;
    profile_image_url?: string | null;
  } | null;
}

export interface ChatMessage {
  id_message: number;
  id_request: number;
  sender_role: 'client' | 'worker';
  message: string | null;
  image_url: string | null;
  created_at: string;
}

export interface WorkerRequestsPayload {
  success: boolean;
  status: string;
  worker_profile?: {
    id_worker_profile: number;
    latitude: number | null;
    longitude: number | null;
    active_request_id?: number | null;
    active_request_status?: string | null;
  };
  requests: WorkerRequest[];
}

export interface RouteAlert {
  tone: 'info' | 'success' | 'warning';
  title: string;
  message: string;
}

export interface SimulatedTrafficSegment {
  points: [number, number][];
  level: 'light' | 'moderate' | 'heavy';
  color: string;
  label: string;
}

export interface SimulatedTrafficSummary {
  level: 'Light' | 'Moderate' | 'Heavy';
  delayMin: number;
  segments: SimulatedTrafficSegment[];
  note: string;
}
