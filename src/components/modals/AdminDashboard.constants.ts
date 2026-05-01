export const DEFAULT_REVENUE_DATA = [
  { name: 'Jan', uv: 0, pv: 0, amt: 0 },
];

export const DEFAULT_TRAFFIC_DATA = [
  { name: 'Mon', Users: 0, Pros: 0 },
];

export const COMMISSION_URGENCY_OPTIONS = [
  { key: 'standard', label: 'Standard', description: 'Base fee with no rush multiplier.' },
  { key: 'urgent', label: 'Urgent', description: 'Adds a faster-response premium.' },
  { key: 'emergency', label: 'Emergency', description: 'Highest urgency for after-hours work.' },
] as const;

export const COMMISSION_TIER_OPTIONS = [
  { key: 'standard', label: 'Standard', description: 'Default worker tier with no loyalty discount.' },
  { key: 'verified', label: 'Verified', description: 'Small fee discount for verified pros.' },
  { key: 'premium', label: 'Premium', description: 'Lower platform fee for premium workers.' },
  { key: 'elite', label: 'Elite', description: 'Best fee discount for top performers.' },
] as const;

export const toDateInputValue = (date: Date) => {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
};
