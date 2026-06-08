export interface ServiceRequestWizardProps {
    isOpen: boolean;
    onClose: () => void;
    initialServiceId?: number;
    initialServiceName?: string;
    onOpenCheckout?: (requestId: number) => void;
}

export interface ServiceOption {
    id_service: number;
    name: string;
    description: string | null;
    icon: string | null;
}

export interface NearbyWorker {
    id_user: number;
    id_worker_profile: number;
    name: string;
    bio: string;
    profile_image: string | null;
    latitude?: number | null;
    longitude?: number | null;
    distance_km: number | null;
}

export interface MyServiceRequest {
    id_request: number;
    id_service: number;
    service_name: string;
    urgency_level?: 'standard' | 'urgent' | 'emergency' | string;
    description: string;
    location_text: string;
    latitude?: number | null;
    longitude?: number | null;
    initial_budget?: number | null;
    budget: number;
    final_budget?: number | null;
    radius_km: number;
    booking_type?: 'express' | 'scheduled' | string;
    scheduled_date?: string | null;
    scheduled_time?: string | null;
    scheduled_start_time?: string | null;
    scheduled_end_time?: string | null;
    status: 'pending' | 'payment_pending' | 'paid' | 'assigned' | 'in_progress' | 'awaiting_confirmation' | 'done' | 'cancelled' | string;
    created_at: string;
    assigned_worker: {
        id_worker_profile: number;
        name: string;
        phone_number?: string | null;
        bio?: string;
        profile_image_url?: string | null;
        latitude?: number | null;
        longitude?: number | null;
        is_online?: boolean | null;
    } | null;
    proposed_budget?: number | null;
    counter_message?: string | null;
    counter_status?: 'pending' | 'accepted' | 'declined' | null;
    payment?: {
        provider: string;
        checkout_reference: string | null;
        currency_code?: string | null;
        amount: number;
        platform_fee?: number | null;
        worker_payout?: number | null;
        commission_rate?: number | null;
        promo_code?: string | null;
        commission_snapshot?: {
            commission_rate?: number | null;
            policy_label?: string | null;
            applied_rules?: Array<{
                id_rule: number;
                name: string;
                rule_type: string;
                rate_percent: number;
            }>;
        } | null;
        status: 'pending' | 'paid' | 'released' | 'refunded' | 'failed' | 'cancelled' | string;
        paid_at: string | null;
        released_at: string | null;
    } | null;
    images: { file_name: string; url: string }[];
}

export interface WorkerPortfolioPhoto {
    id_photo: number;
    description: string;
    uploaded_at: string | null;
    image_url: string | null;
}

export interface RequestWorkerProfileResponse {
    worker: {
        id_worker_profile: number;
        name: string;
        phone_number: string | null;
        bio: string;
        is_online: boolean | null;
        profile_image_url: string | null;
        years_of_experience: number | null;
        experience_label: string;
        rating_average: number | null;
        rating_count: number;
        completed_jobs: number;
        services_offered: string[];
    };
    portfolio: WorkerPortfolioPhoto[];
}

export interface LocationSuggestion {
    label: string;
    lat: number;
    lng: number;
    source?: 'local' | 'nominatim' | string;
    kind?: string;
    short_label?: string;
    context_label?: string;
}

export interface SavedLocation extends LocationSuggestion {
    id_saved_location?: number | null;
    kind: 'home' | 'work' | 'recent' | 'favorite';
    title: string;
    last_used_at?: number | null;
}

export type RatingMetricKey = 'punctuality' | 'quality' | 'price_fairness';

export const RATING_METRIC_LABELS: Record<RatingMetricKey, string> = {
    punctuality: 'Punctuality',
    quality: 'Quality',
    price_fairness: 'Price fairness',
};
