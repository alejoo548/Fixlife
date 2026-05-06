import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, Legend
} from 'recharts';
import { 
  LayoutDashboard, Users, Briefcase, Settings, LogOut, Search, Bell, TrendingUp, Activity, Clock, CheckCircle, Menu, X, ArrowUpRight, ArrowDownRight, ChevronLeft, ChevronRight, Image as ImageIcon, MapPin,
  Plus, Edit3, Trash2, Eye, XCircle, FileText, Shield, Download
} from 'lucide-react';
import { API_ENDPOINTS } from '../../config/api';
import { Notyf } from 'notyf';
import 'notyf/notyf.min.css';
import { getAuthUser, getToken as getSessionToken, isAuthenticated, logoutAuthSession } from '../../utils/session';
import { DashboardThemeToggle } from '../common/DashboardThemeToggle';
import { useDashboardTheme } from '../../hooks/useDashboardTheme';
import {
  DEFAULT_HERO_SLIDES,
  fetchHeroSlides,
  getHeroSlides,
  HeroSlideContent,
  resetHeroSlides,
  saveHeroSlides,
  uploadHeroImageAsset,
  uploadHeroSlideImage,
} from '../../utils/heroSlides';
import { StableResponsiveContainer } from './AdminStableResponsiveContainer';
import {
  COMMISSION_TIER_OPTIONS,
  COMMISSION_URGENCY_OPTIONS,
  DEFAULT_REVENUE_DATA,
  DEFAULT_TRAFFIC_DATA,
  toDateInputValue,
} from './AdminDashboard.constants';
import type {
  AdminActivityItem,
  AdminBackgroundJob,
  AdminCommissionConfig,
  AdminDashboardProps,
  AdminFinanceCase,
  AdminFinanceClosureReport,
  AdminFinanceReport,
  AdminPaymentLedgerItem,
  AdminRequestHistoryItem,
  AdminSystemEvent,
  AdminUser,
  AdminWorkerPayout,
  AdminWorkerRewardsPayout,
  AdminWorkerRewardsSettings,
  AdminWorkerTierBenefit,
  AdminWorkerTierHistoryItem,
  PendingWorker,
  Service,
  ServiceCard,
} from './AdminDashboard.types';

const notyf = new Notyf({ position: { x: 'right', y: 'bottom' }, ripple: true });
export const AdminDashboard: React.FC<AdminDashboardProps> = ({ isOpen, onClose }) => {
  const { theme, isDark, toggleTheme } = useDashboardTheme('admin');
  const [activeTab, setActiveTab] = useState('Overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [user, setUser] = useState<any>(() => getAuthUser('admin'));

  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [serviceForm, setServiceForm] = useState({ name: '', description: '', icon: '' });
  const [serviceCards, setServiceCards] = useState<ServiceCard[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [showCardForm, setShowCardForm] = useState(false);
  const [editingCard, setEditingCard] = useState<ServiceCard | null>(null);
  const [serviceCardForm, setServiceCardForm] = useState({
    id_service: '',
    image_url: '',
    badge: 'POPULAR',
    headline: '',
    summary: '',
    cta_label: 'Learn More',
    sort_order: '1',
    is_active: true,
  });
  const [uploadingCardImage, setUploadingCardImage] = useState(false);

  const [pendingWorkers, setPendingWorkers] = useState<PendingWorker[]>([]);
  const [workersLoading, setWorkersLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userActionLoading, setUserActionLoading] = useState<number | null>(null);
  const [tierUpdateBusyId, setTierUpdateBusyId] = useState<number | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'client' | 'worker' | 'admin' | 'root'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [tierBenefits, setTierBenefits] = useState<AdminWorkerTierBenefit[]>([]);
  const [tierBenefitsLoading, setTierBenefitsLoading] = useState(false);
  const [savingTierBenefits, setSavingTierBenefits] = useState(false);
  const [workerTierHistory, setWorkerTierHistory] = useState<AdminWorkerTierHistoryItem[]>([]);
  const [workerTierHistoryLoading, setWorkerTierHistoryLoading] = useState(false);

  const [dashboardStats, setDashboardStats] = useState<any>(null);
  const [statsServiceId, setStatsServiceId] = useState<'all' | string>('all');
  const [previewDoc, setPreviewDoc] = useState<{ url: string, name: string } | null>(null);

  const [heroSlidesDraft, setHeroSlidesDraft] = useState<HeroSlideContent[]>([]);
  const [unsavedSlideIds, setUnsavedSlideIds] = useState<number[]>([]);
  const [isSavingHeroSlides, setIsSavingHeroSlides] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const [uploadingSlideId, setUploadingSlideId] = useState<number | null>(null);
  const [requestHistory, setRequestHistory] = useState<AdminRequestHistoryItem[]>([]);
  const [requestHistoryLoading, setRequestHistoryLoading] = useState(false);
  const [requestHistoryStatus, setRequestHistoryStatus] = useState<'all' | 'pending' | 'assigned' | 'in_progress' | 'done' | 'cancelled'>('all');
  const [workerRewardsLoading, setWorkerRewardsLoading] = useState(false);
  const [workerRewardsStatus, setWorkerRewardsStatus] = useState<'all' | 'scheduled' | 'paid' | 'cancelled'>('all');
  const [workerRewardsSettings, setWorkerRewardsSettings] = useState<AdminWorkerRewardsSettings | null>(null);
  const [commissionConfig, setCommissionConfig] = useState<AdminCommissionConfig | null>(null);
  const [commissionLoading, setCommissionLoading] = useState(false);
  const [savingCommissionConfig, setSavingCommissionConfig] = useState(false);
  const [commissionForm, setCommissionForm] = useState<{
    global_rate_percent: string;
    service_overrides: Record<string, string>;
    urgency_adjustments: Record<string, string>;
    worker_tier_adjustments: Record<string, string>;
    promo_codes: Array<{ promo_code: string; rate_percent: string }>;
  }>({
    global_rate_percent: '12',
    service_overrides: {},
    urgency_adjustments: {},
    worker_tier_adjustments: {},
    promo_codes: [],
  });
  const [workerRewardsSettingsForm, setWorkerRewardsSettingsForm] = useState({
    trial_min_completed_jobs: '3',
    commission_rate_percent: '7',
    royalty_rate_percent: '4',
    royalty_min_jobs: '8',
    royalty_min_completion_rate: '85',
  });
  const [workerRewardsSummary, setWorkerRewardsSummary] = useState<any>(null);
  const [workerRewardsPayouts, setWorkerRewardsPayouts] = useState<AdminWorkerRewardsPayout[]>([]);
  const [workerPayoutsSummary, setWorkerPayoutsSummary] = useState<any>(null);
  const [workerPayouts, setWorkerPayouts] = useState<AdminWorkerPayout[]>([]);
  const [workerPayoutsLoading, setWorkerPayoutsLoading] = useState(false);
  const [resendingStatementUserId, setResendingStatementUserId] = useState<number | null>(null);
  const [paymentLedgerEntries, setPaymentLedgerEntries] = useState<AdminPaymentLedgerItem[]>([]);
  const [paymentLedgerLoading, setPaymentLedgerLoading] = useState(false);
  const [financeReport, setFinanceReport] = useState<AdminFinanceReport | null>(null);
  const [financeReportLoading, setFinanceReportLoading] = useState(false);
  const [exportingFinanceReport, setExportingFinanceReport] = useState(false);
  const [financeCases, setFinanceCases] = useState<AdminFinanceCase[]>([]);
  const [financeCasesLoading, setFinanceCasesLoading] = useState(false);
  const [creatingFinanceCase, setCreatingFinanceCase] = useState(false);
  const [resolvingFinanceCaseId, setResolvingFinanceCaseId] = useState<number | null>(null);
  const [financeClosureReport, setFinanceClosureReport] = useState<AdminFinanceClosureReport | null>(null);
  const [financeClosureLoading, setFinanceClosureLoading] = useState(false);
  const [financeClosurePeriod, setFinanceClosurePeriod] = useState<'weekly' | 'monthly'>('weekly');
  const [systemEvents, setSystemEvents] = useState<AdminSystemEvent[]>([]);
  const [systemEventsLoading, setSystemEventsLoading] = useState(false);
  const [backgroundJobs, setBackgroundJobs] = useState<AdminBackgroundJob[]>([]);
  const [backgroundJobsLoading, setBackgroundJobsLoading] = useState(false);
  const [financeReportRange, setFinanceReportRange] = useState(() => {
    const today = new Date();
    const from = new Date(today);
    from.setDate(today.getDate() - 29);
    return {
      from: toDateInputValue(from),
      to: toDateInputValue(today),
    };
  });
  const [financeCaseForm, setFinanceCaseForm] = useState({
    case_type: 'refund',
    direction: 'customer_refund',
    id_request: '',
    id_payment: '',
    amount: '',
    currency_code: 'USD',
    reason: '',
    notes: '',
  });
  const [savingWorkerRewardsSettings, setSavingWorkerRewardsSettings] = useState(false);
  const [markingPayoutId, setMarkingPayoutId] = useState<number | null>(null);
  const [markingWorkerPayoutId, setMarkingWorkerPayoutId] = useState<number | null>(null);
  const [requestHistoryServiceId, setRequestHistoryServiceId] = useState<'all' | string>('all');
  const [adminActivity, setAdminActivity] = useState<AdminActivityItem[]>([]);
  const [adminActivityLoading, setAdminActivityLoading] = useState(false);
  const [activityActionFilter, setActivityActionFilter] = useState<'all' | string>('all');
  const [activityEntityFilter, setActivityEntityFilter] = useState<'all' | string>('all');
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement | null>(null);

  const getToken = () => getSessionToken('admin') || '';

  const handleLogout = () => {
    logoutAuthSession('admin');
    onClose();
  };

  useEffect(() => {
    if (!isAuthenticated('admin')) {
      onClose();
      return;
    }

    setUser(getAuthUser('admin'));
  }, [onClose]);

  // ─── Services API ──────────────────────────────────────────────────────
  const fetchServices = async () => {
    setServicesLoading(true);
    try {
      const res = await fetch(API_ENDPOINTS.admin.services, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) setServices(data.services);
    } catch { /* silent */ } finally { setServicesLoading(false); }
  };

  const handleCreateOrUpdateService = async () => {
    const name = serviceForm.name.trim();
    if (!name) { notyf.error('Service name is required.'); return; }
    if (name.length > 100) { notyf.error('Name max 100 characters.'); return; }
    if (/<\s*script|javascript:|on\w+\s*=/i.test(`${serviceForm.name} ${serviceForm.description} ${serviceForm.icon}`)) {
      notyf.error('Scripts or unsafe HTML are not allowed.');
      return;
    }

    try {
      const url = editingService
        ? `${API_ENDPOINTS.admin.services}/${editingService.id_service}`
        : API_ENDPOINTS.admin.services;

      const res = await fetch(url, {
        method: editingService ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          name,
          description: serviceForm.description.trim() || null,
          icon: serviceForm.icon.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { notyf.error(data.error || 'Operation failed'); return; }
      notyf.success(editingService ? 'Service updated!' : 'Service created!');
      setShowServiceForm(false);
      setEditingService(null);
      setServiceForm({ name: '', description: '', icon: '' });
      fetchServices();
    } catch { notyf.error('Connection error'); }
  };

  const handleDeleteService = async (id: number) => {
    if (!confirm('Are you sure you want to delete this service? This will also remove all worker associations.')) return;
    try {
      const res = await fetch(`${API_ENDPOINTS.admin.services}/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) { notyf.error(data.error || 'Delete failed'); return; }
      notyf.success('Service deleted.');
      fetchServices();
    } catch { notyf.error('Connection error'); }
  };

  const handleToggleService = async (svc: Service) => {
    try {
      const res = await fetch(`${API_ENDPOINTS.admin.services}/${svc.id_service}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ is_active: !svc.is_active }),
      });
      const data = await res.json();
      if (!res.ok) { notyf.error(data.error || 'Update failed'); return; }
      notyf.success(svc.is_active ? 'Service paused.' : 'Service activated.');
      fetchServices();
    } catch { notyf.error('Connection error'); }
  };

  const fetchServiceCards = async () => {
    setCardsLoading(true);
    try {
      const res = await fetch(API_ENDPOINTS.admin.serviceCards, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) setServiceCards(data.cards);
    } catch {
    } finally {
      setCardsLoading(false);
    }
  };

  const openCreateCardForm = () => {
    if (availableCardServices.length === 0) {
      notyf.error('No available active services to create a new homepage card.');
      return;
    }
    const firstServiceId = String(availableCardServices[0].id_service);
    const nextSortOrder = Math.max(0, ...serviceCards.map((card) => Number(card.sort_order) || 0)) + 1;
    setEditingCard(null);
    setServiceCardForm({
      id_service: firstServiceId,
      image_url: '',
      badge: 'POPULAR',
      headline: '',
      summary: '',
      cta_label: 'Learn More',
      sort_order: String(nextSortOrder),
      is_active: true,
    });
    setShowCardForm(true);
  };

  const openEditCardForm = (card: ServiceCard) => {
    setEditingCard(card);
    setServiceCardForm({
      id_service: String(card.id_service),
      image_url: card.image_url || '',
      badge: card.badge || 'POPULAR',
      headline: card.headline || '',
      summary: card.summary || '',
      cta_label: card.cta_label || 'Learn More',
      sort_order: String(card.sort_order || 1),
      is_active: !!card.is_active,
    });
    setShowCardForm(true);
  };

  const handleCreateOrUpdateCard = async () => {
    const idService = Number(serviceCardForm.id_service);
    if (!idService) {
      notyf.error('Select a service for the card.');
      return;
    }

    const unsafePattern = /<\s*script|javascript:|on\w+\s*=|data:text\/html/i;
    const valuesToCheck = [
      serviceCardForm.badge,
      serviceCardForm.headline,
      serviceCardForm.summary,
      serviceCardForm.cta_label,
      serviceCardForm.image_url,
    ];
    if (valuesToCheck.some((v) => unsafePattern.test(String(v || '')))) {
      notyf.error('Scripts or unsafe HTML are not allowed.');
      return;
    }

    if (!editingCard && serviceCards.some((card) => card.id_service === idService)) {
      notyf.error('That service already has a homepage card.');
      return;
    }

    const sortOrder = Number(serviceCardForm.sort_order) || 1;
    const hasSortConflict = serviceCards.some(
      (card) => card.id_card !== editingCard?.id_card && Number(card.sort_order) === sortOrder
    );
    if (hasSortConflict) {
      notyf.error('That display order is already used by another card.');
      return;
    }

    const payload = {
      id_service: idService,
      image_url: serviceCardForm.image_url.trim() || null,
      badge: serviceCardForm.badge.trim() || 'POPULAR',
      headline: serviceCardForm.headline.trim() || null,
      summary: serviceCardForm.summary.trim() || null,
      cta_label: serviceCardForm.cta_label.trim() || 'Learn More',
      sort_order: sortOrder,
      is_active: serviceCardForm.is_active,
    };

    try {
      const url = editingCard
        ? `${API_ENDPOINTS.admin.serviceCards}/${editingCard.id_card}`
        : API_ENDPOINTS.admin.serviceCards;

      const res = await fetch(url, {
        method: editingCard ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        notyf.error(data.error || 'Card operation failed.');
        return;
      }
      notyf.success(editingCard ? 'Card updated.' : 'Card created.');
      setShowCardForm(false);
      setEditingCard(null);
      fetchServiceCards();
    } catch {
      notyf.error('Connection error');
    }
  };

  const handleDeleteCard = async (idCard: number) => {
    if (!confirm('Delete this homepage card?')) return;
    try {
      const res = await fetch(`${API_ENDPOINTS.admin.serviceCards}/${idCard}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) {
        notyf.error(data.error || 'Delete failed.');
        return;
      }
      notyf.success('Card deleted.');
      fetchServiceCards();
    } catch {
      notyf.error('Connection error');
    }
  };

  const handleServiceCardImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
      notyf.error('Only PNG/JPG/WEBP files are allowed.');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      notyf.error('Image too large. Max 8MB.');
      return;
    }

    const token = getToken();
    if (!token) {
      notyf.error('Session expired. Please sign in again.');
      return;
    }

    try {
      setUploadingCardImage(true);
      let processed: File = file;
      try {
        processed = await cropTo16x9File(file);
      } catch {
        // Fallback: if browser cannot process canvas crop, upload original file.
        processed = file;
      }
      const formData = new FormData();
      formData.append('image', processed);

      const res = await fetch(API_ENDPOINTS.admin.uploadImageAsset, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const rawText = await res.text();
      let data: any = null;
      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch {
        data = null;
      }

      if (!res.ok || !data?.success || !data?.image) {
        notyf.error(data?.error || `Could not upload image (HTTP ${res.status}).`);
        return;
      }

      setServiceCardForm((prev) => ({ ...prev, image_url: data.image }));
      notyf.success('Image uploaded.');
    } catch (error: any) {
      notyf.error(error?.message || 'Connection error uploading image.');
    } finally {
      setUploadingCardImage(false);
      event.target.value = '';
    }
  };

  // ─── Workers API ───────────────────────────────────────────────────────
  const fetchPendingWorkers = async () => {
    setWorkersLoading(true);
    try {
      const res = await fetch(API_ENDPOINTS.admin.pendingWorkers, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) setPendingWorkers(data.workers);
    } catch { /* silent */ } finally { setWorkersLoading(false); }
  };

  const handleWorkerAction = async (userId: number, action: 'approve' | 'reject') => {
    setActionLoading(userId);
    try {
      const url = action === 'approve'
        ? API_ENDPOINTS.admin.approveWorker(userId)
        : API_ENDPOINTS.admin.rejectWorker(userId);
      const res = await fetch(url, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) { notyf.error(data.error || 'Action failed'); return; }
      notyf.success(action === 'approve' ? 'Worker approved!' : 'Worker rejected.');
      fetchPendingWorkers();
    } catch { notyf.error('Connection error'); } finally { setActionLoading(null); }
  };

  // ─── Users Management API ───────────────────────────────────────────────
  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const params = new URLSearchParams();
      const trimmedSearch = userSearch.trim();
      if (trimmedSearch) params.set('search', trimmedSearch);
      if (roleFilter !== 'all') params.set('role', roleFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const query = params.toString();
      const url = query ? `${API_ENDPOINTS.admin.users}?${query}` : API_ENDPOINTS.admin.users;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) setUsers(data.users);
    } catch {
      // silent
    } finally {
      setUsersLoading(false);
    }
  };

  const handleUpdateUserRole = async (target: AdminUser, nextRole: string) => {
    if (target.rol === 'root') {
      notyf.error('Root user cannot be modified.');
      return;
    }
    if (target.rol === 'worker') {
      notyf.error('Worker role cannot be changed.');
      return;
    }
    if (nextRole === 'worker') {
      notyf.error('Role change not allowed.');
      return;
    }
    if (nextRole === target.rol) return;
    setUserActionLoading(target.id_user);
    try {
      const res = await fetch(API_ENDPOINTS.admin.updateUserRole(target.id_user), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ rol: nextRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        notyf.error(data.error || 'Role update failed');
        return;
      }
      notyf.success('Role updated.');
      setUsers((prev) => prev.map((u) => (u.id_user === target.id_user ? { ...u, rol: nextRole } : u)));
    } catch {
      notyf.error('Connection error');
    } finally {
      setUserActionLoading(null);
    }
  };

  const handleToggleUserStatus = async (target: AdminUser) => {
    if (target.rol === 'root') {
      notyf.error('Root user cannot be modified.');
      return;
    }
    const nextActive = !(target.is_active === true || target.is_active === 1);
    setUserActionLoading(target.id_user);
    try {
      const res = await fetch(API_ENDPOINTS.admin.updateUserStatus(target.id_user), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ is_active: nextActive }),
      });
      const data = await res.json();
      if (!res.ok) {
        notyf.error(data.error || 'Status update failed');
        return;
      }
      notyf.success(nextActive ? 'User activated.' : 'User deactivated.');
      setUsers((prev) =>
        prev.map((u) => (u.id_user === target.id_user ? { ...u, is_active: nextActive ? 1 : 0 } : u))
      );
    } catch {
      notyf.error('Connection error');
    } finally {
      setUserActionLoading(null);
    }
  };

  const fetchWorkerTierBenefits = async () => {
    setTierBenefitsLoading(true);
    try {
      const res = await fetch(API_ENDPOINTS.admin.workerTierBenefits, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        notyf.error(data?.error || 'Could not load tier benefits.');
        return;
      }
      setTierBenefits(Array.isArray(data.benefits) ? data.benefits : []);
    } catch {
      notyf.error('Connection error loading tier benefits.');
    } finally {
      setTierBenefitsLoading(false);
    }
  };

  const fetchWorkerTierHistory = async () => {
    setWorkerTierHistoryLoading(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin.workerTierHistory}?limit=20`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        notyf.error(data?.error || 'Could not load tier history.');
        return;
      }
      setWorkerTierHistory(Array.isArray(data.history) ? data.history : []);
    } catch {
      notyf.error('Connection error loading tier history.');
    } finally {
      setWorkerTierHistoryLoading(false);
    }
  };

  const handleWorkerTierBenefitChange = (
    tier: AdminWorkerTierBenefit['tier'],
    field: keyof Omit<AdminWorkerTierBenefit, 'tier' | 'updated_at'>,
    value: string
  ) => {
    setTierBenefits((prev) =>
      prev.map((item) =>
        item.tier === tier
          ? {
              ...item,
              [field]:
                field === 'priority_weight' ||
                field === 'featured_profile_boost' ||
                field === 'max_active_leads' ||
                field === 'monthly_fee'
                  ? Number(value)
                  : value,
            }
          : item
      )
    );
  };

  const handleSaveWorkerTierBenefits = async () => {
    setSavingTierBenefits(true);
    try {
      const payload = {
        benefits: tierBenefits.map((item) => ({
          ...item,
          priority_weight: Number(item.priority_weight || 0),
          featured_profile_boost: Number(item.featured_profile_boost || 0),
          max_active_leads: Number(item.max_active_leads || 0),
          monthly_fee: Number(item.monthly_fee || 0),
          benefits_summary: item.benefits_summary || '',
        })),
      };
      const res = await fetch(API_ENDPOINTS.admin.workerTierBenefits, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        notyf.error(data?.error || 'Could not save tier benefits.');
        return;
      }
      setTierBenefits(Array.isArray(data.benefits) ? data.benefits : []);
      notyf.success('Tier benefits updated.');
    } catch {
      notyf.error('Connection error saving tier benefits.');
    } finally {
      setSavingTierBenefits(false);
    }
  };

  const handleUpdateWorkerTier = async (target: AdminUser, nextTier: string) => {
    if (!target.id_worker_profile) {
      notyf.error('This user does not have a worker profile.');
      return;
    }
    if ((target.membership_tier || 'standard') === nextTier) return;

    setTierUpdateBusyId(target.id_user);
    try {
      const res = await fetch(API_ENDPOINTS.admin.updateWorkerTier(target.id_user), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          membership_tier: nextTier,
          reason: 'Updated from admin dashboard',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        notyf.error(data?.error || 'Could not update worker tier.');
        return;
      }

      setUsers((prev) =>
        prev.map((userItem) =>
          userItem.id_user === target.id_user
            ? {
                ...userItem,
                membership_tier: nextTier,
                is_verified: ['verified', 'premium', 'elite'].includes(nextTier) ? 1 : userItem.is_verified,
              }
            : userItem
        )
      );
      await fetchWorkerTierHistory();
      notyf.success('Worker tier updated.');
    } catch {
      notyf.error('Connection error updating worker tier.');
    } finally {
      setTierUpdateBusyId(null);
    }
  };

  // ─── Stats API ─────────────────────────────────────────────────────────
  const fetchStats = async (serviceId: 'all' | string = 'all') => {
    try {
      const params = new URLSearchParams();
      if (serviceId !== 'all') params.set('service_id', serviceId);
      const url = params.toString() ? `${API_ENDPOINTS.admin.stats}?${params.toString()}` : API_ENDPOINTS.admin.stats;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) setDashboardStats(data.stats);
    } catch { /* silent */ }
  };

  useEffect(() => {
    fetchStats(activeTab === 'Overview' ? statsServiceId : 'all');
    if (activeTab === 'Overview') {
      fetchServices();
    }
    if (activeTab === 'Services' || activeTab === 'Homepage Cards') {
      fetchServices();
      fetchServiceCards();
    }
    if (activeTab === 'Users & Pros') {
      fetchPendingWorkers();
      fetchUsers();
      fetchWorkerTierBenefits();
      fetchWorkerTierHistory();
    }
    if (activeTab === 'Requests History') {
      fetchRequestsHistory(requestHistoryStatus, requestHistoryServiceId);
      fetchServices();
    }
    if (activeTab === 'Finance Analytics') {
      fetchWorkerRewardsAdmin(workerRewardsStatus);
      fetchWorkerPayoutsAdmin(workerRewardsStatus);
      fetchCommissionRulesAdmin();
      fetchPaymentLedgerAdmin();
      fetchFinanceReportAdmin();
      fetchFinanceCases();
      fetchFinanceClosureReport();
      fetchSystemEvents();
      fetchBackgroundJobs();
      if (services.length === 0) fetchServices();
    }
    if (activeTab === 'Admin Activity') {
      fetchAdminActivity(activityActionFilter, activityEntityFilter);
    }
    
    if (activeTab === 'Platform Settings') {
      fetchHeroSlides().then((slides) => {
        if (Array.isArray(slides) && slides.length > 0) {
          setHeroSlidesDraft(slides);
          setUnsavedSlideIds([]);
        }
      });
    }
  }, [activeTab, statsServiceId]);

  useEffect(() => {
    if (activeTab !== 'Overview') return;
    const id = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      fetchStats(statsServiceId);
    }, 30_000);
    return () => window.clearInterval(id);
  }, [activeTab, statsServiceId]);

  useEffect(() => {
    if (activeTab === 'Requests History') {
      fetchRequestsHistory(requestHistoryStatus, requestHistoryServiceId);
    }
  }, [requestHistoryStatus, requestHistoryServiceId, activeTab]);

  useEffect(() => {
    if (activeTab === 'Admin Activity') {
      fetchAdminActivity(activityActionFilter, activityEntityFilter);
    }
  }, [activityActionFilter, activityEntityFilter, activeTab]);

  useEffect(() => {
    if (isOpen) {
      fetchPendingWorkers();
    }
  }, [isOpen]);

  useEffect(() => {
    if (activeTab === 'Users & Pros') {
      fetchUsers();
    }
  }, [roleFilter, statusFilter, activeTab]);

  useEffect(() => {
    if (!isNotificationsOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (notificationsRef.current && !notificationsRef.current.contains(target)) {
        setIsNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isNotificationsOpen]);

  useEffect(() => {
    if (activeTab === 'Finance Analytics') {
      fetchWorkerRewardsAdmin(workerRewardsStatus);
      fetchWorkerPayoutsAdmin(workerRewardsStatus);
    }
  }, [workerRewardsStatus]);

  useEffect(() => {
    if (activeTab === 'Finance Analytics') {
      fetchFinanceClosureReport(financeClosurePeriod);
    }
  }, [financeClosurePeriod, activeTab]);

  const updateSlideField = (
    index: number,
    field: keyof Omit<HeroSlideContent, 'id'>,
    value: string
  ) => {
    const slideId = heroSlidesDraft[index]?.id;
    if (slideId && !unsavedSlideIds.includes(slideId)) {
      setUnsavedSlideIds((prev) => [...prev, slideId]);
    }
    setHeroSlidesDraft((prev) =>
      prev.map((slide, idx) => (idx === index ? { ...slide, [field]: value } : slide))
    );
  };

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Could not read image file.'));
      reader.readAsDataURL(file);
    });

  const loadImage = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not load selected image.'));
      img.src = src;
    });

  const cropTo16x9File = async (file: File): Promise<File> => {
    const src = await fileToDataUrl(file);
    const image = await loadImage(src);

    const targetAspect = 16 / 9;
    const sourceAspect = image.width / image.height;

    let sx = 0;
    let sy = 0;
    let sw = image.width;
    let sh = image.height;

    if (sourceAspect > targetAspect) {
      sw = Math.round(image.height * targetAspect);
      sx = Math.round((image.width - sw) / 2);
    } else if (sourceAspect < targetAspect) {
      sh = Math.round(image.width / targetAspect);
      sy = Math.round((image.height - sh) / 2);
    }

    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 900;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported by browser.');

    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (!result) {
            reject(new Error('Could not process image.'));
            return;
          }
          resolve(result);
        },
        'image/jpeg',
        0.92
      );
    });

    const baseName = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], `${baseName}-16x9.jpg`, { type: 'image/jpeg' });
  };

  const handleImageUpload = async (index: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
      setSettingsNotice('Only PNG/JPG/WEBP images are allowed.');
      notyf.error('Only PNG/JPG/WEBP images are allowed.');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setSettingsNotice('Image too large. Max 8MB per slide.');
      notyf.error('Image too large. Max 8MB per slide.');
      return;
    }

    const token = getToken();
    if (!token) {
      setSettingsNotice('Session expired. Please sign in again.');
      notyf.error('Session expired. Please sign in again.');
      return;
    }

    try {
      const slideId = heroSlidesDraft[index]?.id ?? null;
      setUploadingSlideId(slideId || -1);
      const cropped = await cropTo16x9File(file);

      if (slideId && slideId > 0) {
        const updatedSlides = await uploadHeroSlideImage(slideId, cropped, token);
        setHeroSlidesDraft(updatedSlides);
        setSettingsNotice(`Slide ${index + 1} image updated (16:9 auto-crop applied).`);
        setUnsavedSlideIds((prev) => (prev.includes(slideId) ? prev : [...prev, slideId]));
      } else {
        const imageUrlFromTemp = await uploadHeroImageAsset(cropped, token);
        setHeroSlidesDraft((prev) => {
          const next = prev.map((slide, idx) => (idx === index ? { ...slide, image: imageUrlFromTemp } : slide));
          return next;
        });
        const tempId = heroSlidesDraft[index]?.id;
        if (tempId) {
          setUnsavedSlideIds((prev) => (prev.includes(tempId) ? prev : [...prev, tempId]));
        }
        setSettingsNotice(`Slide ${index + 1} image uploaded. Save carousel to persist.`);
      }
      notyf.success(`Slide ${index + 1} image updated.`);
    } catch (error: any) {
      setSettingsNotice(error?.message || 'Error processing image.');
      notyf.error(error?.message || 'Error processing image.');
    } finally {
      setUploadingSlideId(null);
    }
  };

  const handleSaveHeroSlides = async () => {
    const token = getToken();
    if (!token) {
      setSettingsNotice('Session expired. Please sign in again.');
      notyf.error('Session expired. Please sign in again.');
      return;
    }

    const invalidSlide = heroSlidesDraft.find(
      (slide) =>
        !slide.image?.trim() ||
        !slide.tag?.trim() ||
        !slide.title?.trim() ||
        !slide.description?.trim() ||
        !slide.cta?.trim()
    );
    if (invalidSlide) {
      setSettingsNotice('All slides need image + text fields before saving.');
      notyf.error('All slides need image + text fields before saving.');
      return;
    }

    try {
      setIsSavingHeroSlides(true);
      const saved = await saveHeroSlides(heroSlidesDraft, token);
      setHeroSlidesDraft(saved);
      setUnsavedSlideIds([]);
      setSettingsNotice('Homepage carousel updated successfully.');
      notyf.success('Homepage carousel updated successfully.');
    } catch (error: any) {
      setSettingsNotice(error?.message || 'Could not save carousel.');
      notyf.error(error?.message || 'Could not save carousel.');
    } finally {
      setIsSavingHeroSlides(false);
    }
  };

  const handleResetHeroSlides = async () => {
    const token = getToken();
    if (!token) {
      setSettingsNotice('Session expired. Please sign in again.');
      notyf.error('Session expired. Please sign in again.');
      return;
    }

    try {
      setIsSavingHeroSlides(true);
      const restored = await saveHeroSlides(DEFAULT_HERO_SLIDES, token);
      resetHeroSlides();
      setHeroSlidesDraft(restored);
      setUnsavedSlideIds([]);
      setSettingsNotice('Carousel restored to default content.');
      notyf.success('Carousel restored to default content.');
    } catch (error: any) {
      setSettingsNotice(error?.message || 'Could not restore defaults.');
      notyf.error(error?.message || 'Could not restore defaults.');
    } finally {
      setIsSavingHeroSlides(false);
    }
  };

  const handleAddSlide = () => {
    if (heroSlidesDraft.length >= 10) {
      setSettingsNotice('Maximum 10 slides allowed.');
      notyf.error('Maximum 10 slides allowed.');
      return;
    }

    const tempId = Date.now() * -1;
    const newSlide: HeroSlideContent = {
      id: tempId,
      image: '',
      tag: 'NEW',
      title: 'New Slide Title',
      description: 'Write a short description for this new slide.',
      cta: 'Explore',
    };
    setHeroSlidesDraft((prev) => [...prev, newSlide]);
    setUnsavedSlideIds((prev) => [...prev, tempId]);
    setSettingsNotice('Slide added. Save carousel to persist changes.');
    notyf.success('Slide added.');
  };

  const handleDeleteSlide = (slideId: number) => {
    if (heroSlidesDraft.length <= 1) {
      setSettingsNotice('At least one slide is required.');
      notyf.error('At least one slide is required.');
      return;
    }

    setHeroSlidesDraft((prev) => prev.filter((slide) => slide.id !== slideId));
    setUnsavedSlideIds((prev) => prev.filter((id) => id !== slideId));
    setSettingsNotice('Slide removed. Save carousel to persist changes.');
    notyf.success('Slide removed.');
  };

  if (!isOpen) return null;

  const stats = [
    { title: "Total Users", value: dashboardStats ? String(dashboardStats.total_users) : "0", change: "", trending: "up", icon: Users, color: "text-emerald-500", bg: "bg-emerald-50", line: "from-emerald-400 to-emerald-600" },
    { title: "Active Pros", value: dashboardStats ? String(dashboardStats.total_pros) : "0", change: "", trending: "up", icon: Briefcase, color: "text-bird-blue", bg: "bg-bird-blue/10", line: "from-bird-blue to-bird-darkBlue" },
    { title: "Admins", value: dashboardStats ? String(dashboardStats.total_admins) : "0", change: "", trending: "up", icon: Shield, color: "text-red-500", bg: "bg-red-50", line: "from-red-400 to-red-600" },
    { title: "Pending Approvals", value: dashboardStats ? String(dashboardStats.pending_pros) : "0", change: "", trending: "down", icon: Clock, color: "text-bird-orange", bg: "bg-bird-orange/10", line: "from-bird-orange to-red-500" },
    { title: "Services", value: dashboardStats ? String(dashboardStats.total_services) : "0", change: "", trending: "up", icon: Briefcase, color: "text-bird-yellow", bg: "bg-bird-yellow/10", line: "from-bird-yellow to-bird-gold" },
  ];

  const serviceCategoryStats = useMemo(() => {
    const raw = Array.isArray(dashboardStats?.serviceCategoryStats) ? dashboardStats.serviceCategoryStats : [];
    const normalized = raw
      .map((item: any) => ({ name: String(item?.name || '').trim(), value: Number(item?.value || 0) }))
      .filter((item: any) => item.name.length > 0);
    return normalized.length > 0 ? normalized : [{ name: 'No data', value: 0 }];
  }, [dashboardStats]);

  const completedServicesWeekly = useMemo(() => {
    const raw = Array.isArray(dashboardStats?.completedServicesWeekly) ? dashboardStats.completedServicesWeekly : [];
    const normalized = raw
      .map((item: any) => ({ name: String(item?.name || '').trim(), value: Number(item?.value || 0) }))
      .filter((item: any) => item.name.length > 0);
    return normalized.length > 0 ? normalized : [{ name: 'Mon', value: 0 }];
  }, [dashboardStats]);

  const completedServicesWeeklyTotal = useMemo(() => {
    return completedServicesWeekly.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
  }, [completedServicesWeekly]);

  const completedServicesWeeklyDeltaText = useMemo(() => {
    const prevTotal = Number(dashboardStats?.completedServicesPrevTotal || 0);
    if (!Number.isFinite(prevTotal) || prevTotal <= 0) return null;
    const pct = ((completedServicesWeeklyTotal - prevTotal) / prevTotal) * 100;
    if (!Number.isFinite(pct)) return null;
    const rounded = Math.round(pct);
    const sign = rounded > 0 ? '+' : '';
    return `${sign}${rounded}% vs last week`;
  }, [dashboardStats, completedServicesWeeklyTotal]);

  const popularLocations = useMemo(() => {
    const raw = Array.isArray(dashboardStats?.popularLocations) ? dashboardStats.popularLocations : [];
    const normalized = raw
      .map((item: any) => {
        const fullName = String(item?.name || '').trim();
        const name = fullName.length > 18 ? `${fullName.slice(0, 18)}…` : fullName;
        return { name, value: Number(item?.value || 0) };
      })
      .filter((item: any) => item.name.length > 0);
    return normalized.length > 0 ? normalized : [{ name: 'No data', value: 0 }];
  }, [dashboardStats]);

  const navItems = [
    { name: "Overview", icon: LayoutDashboard },
    { name: "Users & Pros", icon: Users },
    { name: "Services", icon: Briefcase },
    { name: "Homepage Cards", icon: ImageIcon },
    { name: "Requests History", icon: FileText },
    { name: "Admin Activity", icon: Activity },
    { name: "Platform Settings", icon: Settings },
  ];

  const uniqueServices = useMemo(() => {
    const map = new Map<number, Service>();
    services.forEach((svc) => {
      if (!map.has(svc.id_service)) map.set(svc.id_service, svc);
    });
    return Array.from(map.values());
  }, [services]);

  const availableCardServices = useMemo(() => {
    const blocked = new Set(
      serviceCards
        .filter((c) => !editingCard || c.id_card !== editingCard.id_card)
        .map((c) => c.id_service)
    );
    return uniqueServices.filter((svc) => !blocked.has(svc.id_service) && !!svc.is_active);
  }, [uniqueServices, serviceCards, editingCard]);

  const selectedStatsServiceName = useMemo(() => {
    if (statsServiceId === 'all') return null;
    const found = services.find((svc) => String(svc.id_service) === String(statsServiceId));
    return found?.name ? String(found.name) : null;
  }, [statsServiceId, services]);

  const statsServiceSuffix = statsServiceId === 'all' ? '' : ` (${selectedStatsServiceName || 'Selected'})`;

  const activityActionOptions = useMemo(() => {
    const actions = Array.from(new Set(adminActivity.map((item) => item.action))).sort();
    return ['all', ...actions];
  }, [adminActivity]);

  const activityEntityOptions = useMemo(() => {
    const entities = Array.from(new Set(adminActivity.map((item) => item.entity))).sort();
    return ['all', ...entities];
  }, [adminActivity]);

  const adminChartTheme = useMemo(
    () => ({
      grid: isDark ? 'rgba(71, 85, 105, 0.45)' : '#E5E7EB',
      tick: isDark ? '#94A3B8' : '#6B7280',
      cursor: isDark ? 'rgba(30, 41, 59, 0.72)' : '#F3F4F6',
      tooltip: {
        borderRadius: '16px',
        border: isDark ? '1px solid rgba(71, 85, 105, 0.55)' : 'none',
        backgroundColor: isDark ? 'rgba(15, 23, 42, 0.96)' : 'rgba(255, 255, 255, 0.96)',
        color: isDark ? '#E2E8F0' : '#0F172A',
        boxShadow: isDark
          ? '0 18px 40px rgba(2, 6, 23, 0.45)'
          : '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
      },
      legendStyle: {
        color: isDark ? '#CBD5E1' : '#475569',
        paddingTop: '20px',
      } as React.CSSProperties,
      itemStyle: {
        fontWeight: 'bold',
        color: isDark ? '#E2E8F0' : '#0F172A',
      } as React.CSSProperties,
    }),
    [isDark]
  );

  // ─── RENDER: Services Tab ──────────────────────────────────────────────
  const renderServicesTab = () => (
    <div className="space-y-6">
      {activeTab !== 'Homepage Cards' && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-black text-gray-900">Services Management</h2>
            <p className="text-sm text-gray-500 font-medium">Create and manage service categories for workers</p>
          </div>
          <button
            onClick={() => { setShowServiceForm(true); setEditingService(null); setServiceForm({ name: '', description: '', icon: '' }); }}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-bird-blue to-bird-darkBlue text-white font-bold text-sm shadow-lg shadow-bird-blue/20 hover:scale-[1.02] transition-transform"
          >
            <Plus size={18} /> New Service
          </button>
        </div>
      )}

      {activeTab === 'Homepage Cards' && (
        <div className="rounded-3xl border border-bird-blue/20 bg-gradient-to-r from-bird-blue/10 via-white to-bird-yellow/10 p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white border border-bird-blue/20 flex items-center justify-center text-bird-blue shadow-sm">
              <ImageIcon size={22} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-gray-900">Homepage Cards Manager</h2>
              <p className="text-sm text-gray-600 font-medium mt-1">
                Secure section: only active services from DB, no duplicated service cards, script-safe text fields.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Service Form Modal */}
      <AnimatePresence>
        {showServiceForm && activeTab !== 'Homepage Cards' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white/70 backdrop-blur-xl rounded-3xl border border-white shadow-xl p-6 space-y-4"
          >
            <h3 className="text-lg font-bold text-gray-900">
              {editingService ? 'Edit Service' : 'Create New Service'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Service Name *</label>
                <input
                  type="text"
                  maxLength={100}
                  value={serviceForm.name}
                  onChange={e => setServiceForm({ ...serviceForm, name: e.target.value })}
                  placeholder="e.g. Plumbing"
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-bird-blue focus:ring-4 focus:ring-bird-blue/10 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Icon (SVG path or emoji)</label>
                <input
                  type="text"
                  maxLength={255}
                  value={serviceForm.icon}
                  onChange={e => setServiceForm({ ...serviceForm, icon: e.target.value })}
                  placeholder="🔧 or SVG path data"
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-bird-blue focus:ring-4 focus:ring-bird-blue/10 transition-all"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Description</label>
              <textarea
                maxLength={500}
                value={serviceForm.description}
                onChange={e => setServiceForm({ ...serviceForm, description: e.target.value })}
                placeholder="Brief description of the service..."
                rows={3}
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-bird-blue focus:ring-4 focus:ring-bird-blue/10 transition-all resize-none"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowServiceForm(false); setEditingService(null); }}
                className="px-6 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateOrUpdateService}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-bird-blue to-bird-darkBlue text-white font-bold text-sm shadow-lg shadow-bird-blue/20 hover:scale-[1.02] transition-transform"
              >
                {editingService ? 'Save Changes' : 'Create Service'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Services Table */}
      {activeTab !== 'Homepage Cards' && (
      <div className="bg-white/70 backdrop-blur-xl rounded-3xl border border-white shadow-xl overflow-hidden">
        {servicesLoading ? (
          <div className="p-12 text-center text-gray-400 font-medium">Loading services...</div>
        ) : services.length === 0 ? (
          <div className="p-12 text-center">
            <Briefcase size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 font-medium">No services yet. Create your first service above.</p>
          </div>
        ) : (
          <>
            {/* Desktop View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/50 text-xs uppercase tracking-wider text-gray-500 font-bold border-b border-gray-100">
                    <th className="px-6 py-4">Service</th>
                    <th className="px-6 py-4">Description</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Created</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {services.map((svc) => (
                    <tr key={svc.id_service} className="hover:bg-gray-50/80 transition-colors group">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-bird-blue/10 to-bird-blue/5 flex items-center justify-center text-bird-blue font-bold shrink-0">
                            {svc.icon ? <span className="text-lg">{svc.icon.length <= 2 ? svc.icon : '⚙️'}</span> : <Briefcase size={18} />}
                          </div>
                          <span className="font-bold text-gray-900 text-sm">{svc.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-500 line-clamp-1 max-w-[200px] block">{svc.description || '—'}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => handleToggleService(svc)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border cursor-pointer transition-all hover:scale-105 ${
                            svc.is_active
                              ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                              : 'bg-gray-50 text-gray-500 border-gray-200'
                          }`}
                        >
                          {svc.is_active ? <><CheckCircle size={12} /> Active</> : <><XCircle size={12} /> Paused</>}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">
                        {new Date(svc.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => {
                              setEditingService(svc);
                              setServiceForm({ name: svc.name, description: svc.description || '', icon: svc.icon || '' });
                              setShowServiceForm(true);
                            }}
                            className="p-2 text-gray-400 hover:text-bird-blue hover:bg-bird-blue/10 rounded-lg transition-all"
                          >
                            <Edit3 size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteService(svc.id_service)}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile View */}
            <div className="md:hidden divide-y divide-gray-50">
              {services.map((svc) => (
                <div key={svc.id_service} className="p-4 space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-bird-blue/10 to-bird-blue/5 flex items-center justify-center text-bird-blue font-bold shrink-0">
                        {svc.icon ? <span className="text-lg">{svc.icon.length <= 2 ? svc.icon : '⚙️'}</span> : <Briefcase size={18} />}
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900">{svc.name}</h4>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{new Date(svc.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleToggleService(svc)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold border transition-all ${
                        svc.is_active
                          ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                          : 'bg-gray-50 text-gray-500 border-gray-200'
                      }`}
                    >
                      {svc.is_active ? 'ACTIVE' : 'PAUSED'}
                    </button>
                  </div>
                  <p className="text-sm text-gray-500 line-clamp-2">{svc.description || 'No description provided.'}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditingService(svc);
                        setServiceForm({ name: svc.name, description: svc.description || '', icon: svc.icon || '' });
                        setShowServiceForm(true);
                      }}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gray-50 text-gray-600 font-bold text-xs hover:bg-bird-blue/10 hover:text-bird-blue transition-colors border border-gray-100"
                    >
                      <Edit3 size={14} /> Edit
                    </button>
                    <button
                      onClick={() => handleDeleteService(svc.id_service)}
                      className="px-4 py-2.5 rounded-xl bg-red-50 text-red-500 font-bold text-xs hover:bg-red-100 transition-colors border border-red-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      )}

      {/* Homepage Cards Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-2">
        <div>
          <h3 className="text-xl font-black text-gray-900">
            {activeTab === 'Homepage Cards' ? 'Homepage Cards Manager' : 'Homepage Service Cards'}
          </h3>
          <p className="text-sm text-gray-500 font-medium">
            Cards shown in the landing page "Professional Services" section
          </p>
        </div>
        <button
          onClick={openCreateCardForm}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-bird-blue to-bird-darkBlue text-white font-bold text-sm shadow-lg shadow-bird-blue/20 hover:scale-[1.02] transition-transform"
        >
          <Plus size={16} /> New Homepage Card
        </button>
      </div>

      {/* Card Form */}
      <AnimatePresence>
        {showCardForm && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-white/70 backdrop-blur-xl rounded-3xl border border-white shadow-xl p-6 space-y-4"
          >
            <h3 className="text-lg font-bold text-gray-900">
              {editingCard ? 'Edit Homepage Card' : 'Create Homepage Card'}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Service *</label>
                <select
                  value={serviceCardForm.id_service}
                  onChange={(e) => setServiceCardForm({ ...serviceCardForm, id_service: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-bird-blue focus:ring-4 focus:ring-bird-blue/10 transition-all"
                >
                  <option value="">Select service</option>
                  {Array.from(
                    new Map(
                      [
                        ...availableCardServices,
                        ...(editingCard ? uniqueServices.filter((s) => s.id_service === editingCard.id_service) : []),
                      ].map((s) => [s.id_service, s])
                    ).values()
                  ).map((svc) => (
                    <option key={svc.id_service} value={svc.id_service}>
                      {svc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Badge</label>
                <input
                  type="text"
                  maxLength={40}
                  value={serviceCardForm.badge}
                  onChange={(e) => setServiceCardForm({ ...serviceCardForm, badge: e.target.value })}
                  placeholder="POPULAR"
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-bird-blue focus:ring-4 focus:ring-bird-blue/10 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Sort Order</label>
                <input
                  type="number"
                  min={1}
                  value={serviceCardForm.sort_order}
                  onChange={(e) => setServiceCardForm({ ...serviceCardForm, sort_order: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-bird-blue focus:ring-4 focus:ring-bird-blue/10 transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Headline</label>
                <input
                  type="text"
                  maxLength={120}
                  value={serviceCardForm.headline}
                  onChange={(e) => setServiceCardForm({ ...serviceCardForm, headline: e.target.value })}
                  placeholder="Card title in homepage"
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-bird-blue focus:ring-4 focus:ring-bird-blue/10 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Button Label</label>
                <input
                  type="text"
                  maxLength={60}
                  value={serviceCardForm.cta_label}
                  onChange={(e) => setServiceCardForm({ ...serviceCardForm, cta_label: e.target.value })}
                  placeholder="Learn More"
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-bird-blue focus:ring-4 focus:ring-bird-blue/10 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Summary</label>
              <textarea
                maxLength={255}
                rows={2}
                value={serviceCardForm.summary}
                onChange={(e) => setServiceCardForm({ ...serviceCardForm, summary: e.target.value })}
                placeholder="Short text below the title"
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-bird-blue focus:ring-4 focus:ring-bird-blue/10 transition-all resize-none"
              />
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
                Card Image (Dropify Upload)
              </label>
              <label className="block cursor-pointer">
                <div className="w-full rounded-2xl border-2 border-dashed border-gray-300 bg-gradient-to-br from-white to-sky-50 hover:from-sky-50 hover:to-blue-50 hover:border-bird-blue transition p-6 text-center">
                  <div className="text-bird-blue text-3xl font-black leading-none">+</div>
                  <div className="text-gray-900 font-black mt-1">Dropify Upload Zone</div>
                  <div className="text-xs text-gray-500">PNG/JPG/WEBP, auto-center crop to 16:9 (1600x900)</div>
                  <span className="inline-block mt-3 bg-bird-blue text-white px-3 py-1.5 rounded-lg text-sm font-bold shadow">
                    {uploadingCardImage ? 'Uploading...' : 'Dropify Select Image'}
                  </span>
                </div>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={handleServiceCardImageUpload}
                  className="hidden"
                />
              </label>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Or paste Image URL</label>
                <input
                  type="text"
                  maxLength={255}
                  value={serviceCardForm.image_url}
                  onChange={(e) => setServiceCardForm({ ...serviceCardForm, image_url: e.target.value })}
                  placeholder="https://... (16:9 recommended)"
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-bird-blue focus:ring-4 focus:ring-bird-blue/10 transition-all"
                />
              </div>

              <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700">
                <input
                  type="checkbox"
                  checked={serviceCardForm.is_active}
                  onChange={(e) => setServiceCardForm({ ...serviceCardForm, is_active: e.target.checked })}
                  className="rounded border-gray-300"
                />
                Card active
              </label>
            </div>

            {serviceCardForm.image_url && (
              <div className="rounded-2xl border border-gray-200 overflow-hidden max-w-md">
                <img
                  src={serviceCardForm.image_url}
                  alt="Card preview"
                  className="w-full aspect-[16/9] object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            )}

            <div className="flex gap-3 justify-end pt-1">
              <button
                onClick={() => {
                  setShowCardForm(false);
                  setEditingCard(null);
                }}
                className="px-6 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateOrUpdateCard}
                disabled={uploadingCardImage}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-bird-blue to-bird-darkBlue text-white font-bold text-sm shadow-lg shadow-bird-blue/20 hover:scale-[1.02] transition-transform"
              >
                {uploadingCardImage ? 'Uploading image...' : editingCard ? 'Save Card' : 'Create Card'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Homepage Cards List */}
      <div className="bg-white/70 backdrop-blur-xl rounded-3xl border border-white shadow-xl overflow-hidden">
        {cardsLoading ? (
          <div className="p-10 text-center text-gray-400 font-medium">Loading homepage cards...</div>
        ) : serviceCards.length === 0 ? (
          <div className="p-10 text-center text-gray-500 font-medium">No homepage cards yet. Add one above.</div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/50 text-xs uppercase tracking-wider text-gray-500 font-bold border-b border-gray-100">
                    <th className="px-6 py-4">Card</th>
                    <th className="px-6 py-4">Service</th>
                    <th className="px-6 py-4">Order</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {serviceCards.map((card) => (
                    <tr key={card.id_card} className="hover:bg-gray-50/80 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3 min-w-[260px]">
                          <div className="w-16 h-10 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 shrink-0">
                            {card.image_url ? (
                              <img src={card.image_url} alt={card.headline || card.service_name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">No image</div>
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-900 line-clamp-1">{card.headline || card.service_name}</p>
                            <p className="text-xs text-gray-500 line-clamp-1">{card.cta_label || 'Learn More'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-700">{card.service_name}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 font-bold">{card.sort_order}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${
                            card.is_active
                              ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                              : 'bg-gray-50 text-gray-500 border-gray-200'
                          }`}
                        >
                          {card.is_active ? <><CheckCircle size={12} /> Active</> : <><XCircle size={12} /> Paused</>}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => openEditCardForm(card)}
                            className="p-2 text-gray-400 hover:text-bird-blue hover:bg-bird-blue/10 rounded-lg transition-all"
                          >
                            <Edit3 size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteCard(card.id_card)}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="md:hidden divide-y divide-gray-50">
              {serviceCards.map((card) => (
                <div key={card.id_card} className="p-4 space-y-4">
                  <div className="flex gap-4">
                    <div className="w-24 h-16 rounded-xl overflow-hidden bg-gray-100 border border-gray-200 shrink-0 shadow-sm">
                      {card.image_url ? (
                        <img src={card.image_url} alt={card.headline || card.service_name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400 font-bold">NO IMAGE</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <h4 className="font-bold text-gray-900 text-sm line-clamp-1">{card.headline || card.service_name}</h4>
                        <span className="shrink-0 text-[10px] font-black bg-gray-100 text-gray-500 px-2 py-0.5 rounded-md">Order #{card.sort_order}</span>
                      </div>
                      <p className="text-[10px] text-bird-blue font-bold mt-1 uppercase tracking-tight">{card.service_name}</p>
                      <div className="mt-2 text-right">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all ${
                          card.is_active
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                            : 'bg-gray-50 text-gray-500 border-gray-200'
                        }`}>
                          {card.is_active ? 'ACTIVE' : 'PAUSED'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEditCardForm(card)}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-600 font-bold text-xs hover:bg-bird-blue/10 hover:text-bird-blue transition-colors shadow-sm"
                    >
                      <Edit3 size={14} /> Edit
                    </button>
                    <button
                      onClick={() => handleDeleteCard(card.id_card)}
                      className="px-4 py-2.5 rounded-xl bg-red-50 text-red-500 font-bold text-xs hover:bg-red-100 transition-colors border border-red-50"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );

  // ─── RENDER: Users & Pros (Pending Workers) Tab ────────────────────────
  const renderUsersTab = () => (
    <div className="space-y-10">
      <div className="space-y-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-black text-gray-900">Worker tiers and benefits</h2>
            <p className="text-sm text-gray-500 font-medium">
              Control visibility, lead caps, support level and monthly fee for each worker tier.
            </p>
          </div>
          <button
            onClick={handleSaveWorkerTierBenefits}
            disabled={savingTierBenefits || tierBenefitsLoading || tierBenefits.length === 0}
            className="px-5 py-3 rounded-2xl bg-gradient-to-r from-bird-blue to-bird-darkBlue text-white text-sm font-black shadow-lg shadow-bird-blue/20 disabled:opacity-60"
          >
            {savingTierBenefits ? 'Saving...' : 'Save tier benefits'}
          </button>
        </div>

        {tierBenefitsLoading ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 text-sm font-semibold text-gray-500">
            Loading tier benefits...
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {tierBenefits.map((benefit) => (
              <div key={benefit.tier} className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-gray-900">{benefit.badge_label || benefit.tier}</h3>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-bird-blue">{benefit.tier}</p>
                  </div>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">
                    ${Number(benefit.monthly_fee || 0).toFixed(2)}/mo
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-[11px] font-black uppercase tracking-[0.16em] text-gray-500">Badge</span>
                    <input value={benefit.badge_label} onChange={(e) => handleWorkerTierBenefitChange(benefit.tier, 'badge_label', e.target.value)} className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] font-black uppercase tracking-[0.16em] text-gray-500">Support</span>
                    <input value={benefit.support_level} onChange={(e) => handleWorkerTierBenefitChange(benefit.tier, 'support_level', e.target.value)} className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] font-black uppercase tracking-[0.16em] text-gray-500">Priority</span>
                    <input type="number" min={1} max={20} value={benefit.priority_weight} onChange={(e) => handleWorkerTierBenefitChange(benefit.tier, 'priority_weight', e.target.value)} className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] font-black uppercase tracking-[0.16em] text-gray-500">Boost</span>
                    <input type="number" min={1} max={10} step="0.05" value={benefit.featured_profile_boost} onChange={(e) => handleWorkerTierBenefitChange(benefit.tier, 'featured_profile_boost', e.target.value)} className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] font-black uppercase tracking-[0.16em] text-gray-500">Max active leads</span>
                    <input type="number" min={1} max={500} value={benefit.max_active_leads} onChange={(e) => handleWorkerTierBenefitChange(benefit.tier, 'max_active_leads', e.target.value)} className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] font-black uppercase tracking-[0.16em] text-gray-500">Monthly fee</span>
                    <input type="number" min={0} max={9999} step="0.01" value={benefit.monthly_fee} onChange={(e) => handleWorkerTierBenefitChange(benefit.tier, 'monthly_fee', e.target.value)} className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900" />
                  </label>
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-[11px] font-black uppercase tracking-[0.16em] text-gray-500">Summary</span>
                    <textarea value={benefit.benefits_summary || ''} onChange={(e) => handleWorkerTierBenefitChange(benefit.tier, 'benefits_summary', e.target.value)} className="min-h-[88px] w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900" />
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Users Management */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-gray-900">User Management</h2>
            <p className="text-sm text-gray-500 font-medium">Manage roles and account status</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchUsers()}
              placeholder="Search name, email, username"
              className="w-64 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold"
            />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as any)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold"
            >
              <option value="all">All Roles</option>
              <option value="client">Client</option>
              <option value="worker">Pro</option>
              <option value="admin">Admin</option>
              <option value="root">Root</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <button
              onClick={fetchUsers}
              className="px-4 py-2 rounded-xl bg-bird-blue text-white text-sm font-bold shadow hover:bg-bird-darkBlue transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>

        {usersLoading ? (
          <div className="p-10 rounded-2xl border border-gray-200 bg-white text-gray-500 font-semibold">
            Loading users...
          </div>
        ) : users.length === 0 ? (
          <div className="p-10 rounded-2xl border border-gray-200 bg-white text-gray-500 font-semibold">
            No users found for this filter.
          </div>
        ) : (
          <>
            {/* Desktop View */}
            <div className="hidden md:block overflow-x-auto rounded-2xl border border-gray-200 bg-white">
              <table className="w-full text-left border-collapse min-w-[980px]">
                <thead>
                  <tr className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 font-bold border-b border-gray-100">
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Tier</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3">Last Login</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map((account) => {
                    const isRoot = account.rol === 'root';
                    const isWorker = account.rol === 'worker';
                    const isActive = account.is_active === true || account.is_active === 1;
                    const isBusy = userActionLoading === account.id_user || tierUpdateBusyId === account.id_user;
                    return (
                      <tr key={account.id_user} className="hover:bg-gray-50/80">
                        <td className="px-4 py-3">
                          <p className="font-bold text-gray-900">{account.name} {account.lastname}</p>
                          <p className="text-xs text-gray-500">{account.email}</p>
                          <p className="text-[11px] text-gray-400">{account.username ? `@${account.username}` : '-'}</p>
                        </td>
                        <td className="px-4 py-3">
                          {isRoot || isWorker ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-600 border border-gray-200">
                              {isRoot ? 'Root' : 'Pro'}
                            </span>
                          ) : (
                            <select
                              disabled={isBusy}
                              value={account.rol}
                              onChange={(e) => handleUpdateUserRole(account, e.target.value)}
                              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold"
                            >
                              <option value="client">Client</option>
                              <option value="admin">Admin</option>
                            </select>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isWorker && account.id_worker_profile ? (
                            <select
                              disabled={isBusy}
                              value={account.membership_tier || 'standard'}
                              onChange={(e) => handleUpdateWorkerTier(account, e.target.value)}
                              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold"
                            >
                              {COMMISSION_TIER_OPTIONS.map((option) => (
                                <option key={option.key} value={option.key}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-500 border border-gray-200">
                              n/a
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            disabled={isRoot || isBusy}
                            onClick={() => handleToggleUserStatus(account)}
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border transition-all ${
                              isActive
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-gray-50 text-gray-600 border-gray-200'
                            } ${isRoot ? 'opacity-60 cursor-not-allowed' : 'hover:shadow-sm'}`}
                          >
                            {isActive ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {account.created_at ? new Date(account.created_at).toLocaleDateString() : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {account.last_login ? new Date(account.last_login).toLocaleString() : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile View */}
            <div className="md:hidden space-y-4">
              {users.map((account) => {
                const isRoot = account.rol === 'root';
                const isWorker = account.rol === 'worker';
                const isActive = account.is_active === true || account.is_active === 1;
                const isBusy = userActionLoading === account.id_user || tierUpdateBusyId === account.id_user;
                return (
                  <div key={account.id_user} className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white shadow-lg p-5 space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-bold text-gray-900">{account.name} {account.lastname}</p>
                        <p className="text-xs text-gray-500">{account.email}</p>
                        <p className="text-[11px] text-gray-400">{account.username ? `@${account.username}` : '-'}</p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                        isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-600 border-gray-200'
                      }`}>
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs text-gray-600">
                      <div>
                        <div className="text-[10px] font-bold uppercase text-gray-400">Created</div>
                        <div>{account.created_at ? new Date(account.created_at).toLocaleDateString() : '-'}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase text-gray-400">Last Login</div>
                        <div>{account.last_login ? new Date(account.last_login).toLocaleDateString() : '-'}</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-[10px] font-bold uppercase text-gray-400">Tier</div>
                        {isWorker && account.id_worker_profile ? (
                          <select
                            disabled={isBusy}
                            value={account.membership_tier || 'standard'}
                            onChange={(e) => handleUpdateWorkerTier(account, e.target.value)}
                            className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold"
                          >
                            {COMMISSION_TIER_OPTIONS.map((option) => (
                              <option key={option.key} value={option.key}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="mt-1 text-xs font-semibold text-gray-500">n/a</div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isRoot || isWorker ? (
                        <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-gray-100 text-gray-600 border border-gray-200">
                          {isRoot ? 'Root' : 'Pro'}
                        </span>
                      ) : (
                        <select
                          disabled={isBusy}
                          value={account.rol}
                          onChange={(e) => handleUpdateUserRole(account, e.target.value)}
                          className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold"
                        >
                          <option value="client">Client</option>
                          <option value="admin">Admin</option>
                        </select>
                      )}
                      <button
                        disabled={isRoot || isBusy}
                        onClick={() => handleToggleUserStatus(account)}
                        className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                          isActive
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-gray-50 text-gray-600 border-gray-200'
                        } ${isRoot ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        {isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900">Recent tier history</h2>
          <p className="text-sm text-gray-500 font-medium">Audit trail for worker tier changes.</p>
        </div>

        {workerTierHistoryLoading ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 text-sm font-semibold text-gray-500">
            Loading tier history...
          </div>
        ) : workerTierHistory.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 text-sm font-semibold text-gray-500">
            No tier changes yet.
          </div>
        ) : (
          <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="space-y-3">
              {workerTierHistory.map((item) => (
                <div key={item.id_history} className="rounded-2xl border border-gray-200 bg-slate-50/60 p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-black text-gray-900">{item.worker_name}</p>
                      <p className="text-sm text-gray-500">
                        {item.previous_tier ? `${item.previous_tier} -> ${item.next_tier}` : `Set to ${item.next_tier}`}
                      </p>
                      {item.reason && <p className="mt-1 text-xs text-gray-500">{item.reason}</p>}
                    </div>
                    <div className="text-sm text-gray-500">
                      <div>{item.changed_by_name || 'System'}</div>
                      <div>{new Date(item.created_at).toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Pending Workers */}
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-black text-gray-900">Pending Worker Applications</h2>
          <p className="text-sm text-gray-500 font-medium">Review and approve worker registrations</p>
        </div>

        {workersLoading ? (
          <div className="p-12 text-center text-gray-400 font-medium">Loading applications...</div>
        ) : pendingWorkers.length === 0 ? (
          <div className="bg-white/70 backdrop-blur-xl rounded-3xl border border-white shadow-xl p-12 text-center">
            <CheckCircle size={48} className="mx-auto text-emerald-400 mb-4" />
            <p className="text-gray-600 font-bold text-lg mb-1">All caught up!</p>
            <p className="text-gray-500 font-medium text-sm">No pending applications at this time.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {pendingWorkers.map((worker) => (
              <motion.div
                key={worker.id_user}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/70 backdrop-blur-xl rounded-3xl border border-white shadow-xl overflow-hidden hover:shadow-2xl transition-shadow"
              >
                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-bird-orange/10 to-bird-yellow/10 flex items-center justify-center text-bird-orange font-black text-xl shrink-0 border border-bird-orange/10">
                    {worker.name.charAt(0)}{worker.lastname.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-900 text-lg truncate">{worker.name} {worker.lastname}</h3>
                    <p className="text-sm text-gray-500 truncate">{worker.email}</p>
                  </div>
                  <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-amber-50 text-amber-600 border border-amber-100 shrink-0">
                    <Clock size={12} className="inline mr-1" />Pending
                  </span>
                </div>

                {/* Details */}
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Phone</span>
                      <p className="font-medium text-gray-700 mt-0.5">{worker.phone_number || '-'}</p>
                    </div>
                    <div>
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Registered</span>
                      <p className="font-medium text-gray-700 mt-0.5">{new Date(worker.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>

                  {/* Services */}
                  {worker.services && worker.services.length > 0 && (
                    <div>
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Specialties</span>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {worker.services.map(s => (
                          <span key={s.id_service} className="px-2.5 py-1 rounded-lg bg-bird-blue/10 text-bird-blue text-xs font-bold">
                            {s.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Documents */}
                  <div>
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Documents</span>
                    <div className="mt-1.5 flex gap-3">
                      {worker.dui_document_url ? (
                        <button onClick={() => setPreviewDoc({ url: worker.dui_document_url!, name: 'DUI Document' })}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-bird-blue/5 border border-bird-blue/10 text-bird-blue text-xs font-bold hover:bg-bird-blue/10 transition-colors">
                          <FileText size={14} /> View DUI
                        </button>
                      ) : <span className="text-xs text-gray-400 italic">No DUI uploaded</span>}
                      {worker.cert_document_url ? (
                        <button onClick={() => setPreviewDoc({ url: worker.cert_document_url!, name: 'Certificate' })}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-bird-yellow/10 border border-bird-yellow/20 text-bird-gold text-xs font-bold hover:bg-bird-yellow/20 transition-colors">
                          <Shield size={14} /> View Cert
                        </button>
                      ) : <span className="text-xs text-gray-400 italic">No cert uploaded</span>}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="p-6 pt-0 flex gap-3">
                  <button
                    disabled={actionLoading === worker.id_user}
                    onClick={() => handleWorkerAction(worker.id_user, 'approve')}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <CheckCircle size={16} />
                    {actionLoading === worker.id_user ? 'Processing...' : 'Approve'}
                  </button>
                  <button
                    disabled={actionLoading === worker.id_user}
                    onClick={() => handleWorkerAction(worker.id_user, 'reject')}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-red-200 text-red-500 font-bold text-sm hover:bg-red-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <XCircle size={16} />
                    {actionLoading === worker.id_user ? 'Processing...' : 'Reject'}
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

const renderRequestsHistoryTab = () => {
    const badgeClass = (statusRaw: string) => {
      const status = String(statusRaw || 'pending').toLowerCase();
      if (status === 'done') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      if (status === 'assigned') return 'bg-blue-50 text-blue-700 border-blue-200';
      if (status === 'in_progress') return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      if (status === 'cancelled') return 'bg-red-50 text-red-700 border-red-200';
      return 'bg-amber-50 text-amber-700 border-amber-200';
    };

    const label = (statusRaw: string) => {
      const status = String(statusRaw || 'pending').toLowerCase();
      if (status === 'in_progress') return 'In Progress';
      return status.charAt(0).toUpperCase() + status.slice(1);
    };

    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-gray-900">Requests History</h2>
            <p className="text-sm text-gray-500 font-medium">Client/Admin timeline by status</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={requestHistoryStatus}
              onChange={(e) => setRequestHistoryStatus(e.target.value as any)}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Done</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select
              value={requestHistoryServiceId}
              onChange={(e) => setRequestHistoryServiceId(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold"
            >
              <option value="all">All Services</option>
              {uniqueServices.map((svc) => (
                <option key={svc.id_service} value={String(svc.id_service)}>
                  {svc.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {requestHistoryLoading ? (
          <div className="p-10 rounded-2xl border border-gray-200 bg-white text-gray-500 font-semibold">
            Loading request history...
          </div>
        ) : requestHistory.length === 0 ? (
          <div className="p-10 rounded-2xl border border-gray-200 bg-white text-gray-500 font-semibold">
            No requests found for this filter.
          </div>
        ) : (
          <>
            {/* Desktop View */}
            <div className="hidden md:block overflow-x-auto rounded-2xl border border-gray-200 bg-white">
              <table className="w-full text-left border-collapse min-w-[980px]">
                <thead>
                  <tr className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 font-bold border-b border-gray-100">
                    <th className="px-4 py-3">Request</th>
                    <th className="px-4 py-3">Service</th>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Worker</th>
                    <th className="px-4 py-3">Budget</th>
                    <th className="px-4 py-3">Images</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {requestHistory.map((request) => (
                    <tr key={request.id_request} className="hover:bg-gray-50/80">
                      <td className="px-4 py-3">
                        <p className="font-bold text-gray-900">#{request.id_request}</p>
                        <p className="text-xs text-gray-500 line-clamp-1">{request.location_text}</p>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-800">{request.service_name}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-gray-800">{request.client?.name || 'Guest'}</p>
                        <p className="text-xs text-gray-500">{request.client?.email || 'No email'}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{request.assigned_worker?.name || 'Unassigned'}</td>
                      <td className="px-4 py-3 text-sm font-bold text-gray-800">${Number(request.budget || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{request.images_count}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold border ${badgeClass(request.status)}`}>
                          {label(request.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{new Date(request.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile View */}
            <div className="md:hidden space-y-4">
              {requestHistory.map((request) => (
                <div key={request.id_request} className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white shadow-lg p-5 space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-bird-blue bg-bird-blue/10 px-2 py-0.5 rounded-md">#{request.id_request}</span>
                        <h4 className="font-bold text-gray-900">{request.service_name}</h4>
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-1"><MapPin size={10} className="inline mr-1" />{request.location_text}</p>
                    </div>
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-black border uppercase tracking-tight ${badgeClass(request.status)}`}>
                      {label(request.status)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 py-3 border-y border-gray-50">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Client</p>
                      <p className="text-xs font-bold text-gray-700 truncate">{request.client?.name || 'Guest'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Worker</p>
                      <p className="text-xs font-bold text-gray-700 truncate">{request.assigned_worker?.name || 'Unassigned'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Budget</p>
                      <p className="text-sm font-black text-gray-900">${Number(request.budget || 0).toFixed(2)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Registered</p>
                      <p className="text-xs font-bold text-gray-600">{new Date(request.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>

                  {request.images_count > 0 && (
                     <div className="flex items-center gap-1.5 text-xs font-bold text-bird-blue bg-bird-blue/5 w-fit px-3 py-1.5 rounded-lg border border-bird-blue/10">
                        <ImageIcon size={14} /> {request.images_count} Evidence Photos
                     </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  const renderAdminActivityTab = () => {
    const actionBadge = (actionRaw: string) => {
      const action = String(actionRaw || '').toLowerCase();
      if (action === 'create' || action === 'approve' || action === 'activate') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      if (action === 'update') return 'bg-blue-50 text-blue-700 border-blue-200';
      if (action === 'delete' || action === 'reject') return 'bg-red-50 text-red-700 border-red-200';
      if (action === 'deactivate' || action === 'status_change') return 'bg-amber-50 text-amber-700 border-amber-200';
      if (action === 'role_change') return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      if (action === 'upload') return 'bg-violet-50 text-violet-700 border-violet-200';
      return 'bg-gray-50 text-gray-700 border-gray-200';
    };

    const entityBadge = (entityRaw: string) => {
      const entity = String(entityRaw || '').toLowerCase();
      if (entity === 'service') return 'bg-bird-yellow/10 text-bird-gold border-bird-yellow/20';
      if (entity === 'service_card') return 'bg-bird-blue/10 text-bird-blue border-bird-blue/20';
      if (entity === 'worker') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      if (entity === 'user') return 'bg-gray-50 text-gray-700 border-gray-200';
      if (entity === 'hero_slide') return 'bg-purple-50 text-purple-700 border-purple-200';
      return 'bg-gray-50 text-gray-700 border-gray-200';
    };

    const formatLabel = (value: string) =>
      String(value || '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());

    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-gray-900">Admin Activity</h2>
            <p className="text-sm text-gray-500 font-medium">Historial de cambios realizados en el panel</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={activityActionFilter}
              onChange={(e) => setActivityActionFilter(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold"
            >
              {activityActionOptions.map((action) => (
                <option key={action} value={action}>
                  {action === 'all' ? 'All Actions' : formatLabel(action)}
                </option>
              ))}
            </select>
            <select
              value={activityEntityFilter}
              onChange={(e) => setActivityEntityFilter(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold"
            >
              {activityEntityOptions.map((entity) => (
                <option key={entity} value={entity}>
                  {entity === 'all' ? 'All Sections' : formatLabel(entity)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {adminActivityLoading ? (
          <div className="p-10 rounded-2xl border border-gray-200 bg-white text-gray-500 font-semibold">
            Loading admin activity...
          </div>
        ) : adminActivity.length === 0 ? (
          <div className="p-10 rounded-2xl border border-gray-200 bg-white text-gray-500 font-semibold">
            No admin activity registered yet.
          </div>
        ) : (
          <>
            {/* Desktop View */}
            <div className="hidden md:block overflow-x-auto rounded-2xl border border-gray-200 bg-white">
              <table className="w-full text-left border-collapse min-w-[980px]">
                <thead>
                  <tr className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 font-bold border-b border-gray-100">
                    <th className="px-4 py-3">Summary</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Section</th>
                    <th className="px-4 py-3">Admin</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {adminActivity.map((item) => (
                    <tr key={item.id_activity} className="hover:bg-gray-50/80">
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-gray-900">{item.summary}</p>
                        {item.entity_id && (
                          <p className="text-xs text-gray-500">ID {item.entity_id}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold border ${actionBadge(item.action)}`}>
                          {formatLabel(item.action)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold border ${entityBadge(item.entity)}`}>
                          {formatLabel(item.entity)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-gray-800">{item.admin?.name || 'Admin'}</p>
                        <p className="text-xs text-gray-500">{item.admin?.email || '-'}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{new Date(item.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile View */}
            <div className="md:hidden space-y-4">
              {adminActivity.map((item) => (
                <div key={item.id_activity} className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white shadow-lg p-5 space-y-4">
                  <div className="flex justify-between items-start gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-gray-900">{item.summary}</p>
                      <p className="text-xs text-gray-500">{item.admin?.name || 'Admin'}</p>
                    </div>
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-black border uppercase tracking-tight ${actionBadge(item.action)}`}>
                      {formatLabel(item.action)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-black border uppercase tracking-tight ${entityBadge(item.entity)}`}>
                      {formatLabel(item.entity)}
                    </span>
                    {item.entity_id && (
                      <span className="text-[10px] font-bold text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1">
                        ID {item.entity_id}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 font-semibold">
                    {new Date(item.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  const renderOverviewTab = () => (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-gray-900">Overview</h2>
          <p className="text-sm text-gray-500 font-medium">Platform statistics updated from the database</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-500">Service</span>
          <select
            value={statsServiceId}
            onChange={(e) => setStatsServiceId(e.target.value === 'all' ? 'all' : e.target.value)}
            className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-xl px-4 py-2 font-medium outline-none focus:ring-2 focus:ring-bird-blue/20"
          >
            <option value="all">All services</option>
            {services.map((svc) => (
              <option key={svc.id_service} value={String(svc.id_service)}>
                {svc.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {stats.map((stat, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, duration: 0.5, ease: "easeOut" }}
            key={stat.title}
            className="bg-white/70 backdrop-blur-xl rounded-3xl p-6 border border-white shadow-xl shadow-gray-200/20 relative overflow-hidden group hover:-translate-y-1 transition-all duration-300"
          >
            <div className={`absolute -right-10 -top-10 w-32 h-32 ${stat.bg} rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700`} />
            <div className="flex justify-between items-start mb-6">
              <div className={`p-3.5 rounded-2xl ${stat.bg} ${stat.color} shadow-sm border border-white/50 backdrop-blur-md`}>
                <stat.icon size={24} />
              </div>
              {stat.change && (
                <span className={`inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full shadow-sm ${
                  stat.trending === 'up' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'
                }`}>
                  {stat.trending === 'up' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  {stat.change}
                </span>
              )}
            </div>
            <div className="relative z-10">
              <h3 className="text-gray-500 text-sm font-semibold mb-1">{stat.title}</h3>
              <p className="text-3xl font-black text-gray-900 tracking-tight">{stat.value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Admin Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="bg-white/70 backdrop-blur-xl rounded-3xl border border-white shadow-xl shadow-gray-200/20 p-6 flex flex-col h-[320px] md:h-[360px]"
        >
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Service Categories</h3>
              <p className="text-sm text-gray-500 font-medium">Current distribution by category</p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-bird-blue/10 text-bird-blue flex items-center justify-center border border-bird-blue/20">
              <Briefcase size={18} />
            </div>
          </div>
          <div className="flex-1 w-full min-h-0">
            <StableResponsiveContainer>
              <BarChart data={serviceCategoryStats} margin={{ top: 10, right: 0, left: -25, bottom: 0 }} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={adminChartTheme.grid} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: adminChartTheme.tick, fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: adminChartTheme.tick, fontSize: 12 }} />
                <Tooltip 
                  cursor={{ fill: adminChartTheme.cursor }}
                  contentStyle={adminChartTheme.tooltip}
                  itemStyle={adminChartTheme.itemStyle}
                  labelStyle={{ color: adminChartTheme.tooltip.color }}
                />
                <Bar dataKey="value" name="Share" fill="#0090FF" radius={[6, 6, 0, 0]} />
              </BarChart>
            </StableResponsiveContainer>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="bg-white/70 backdrop-blur-xl rounded-3xl border border-white shadow-xl shadow-gray-200/20 p-6 flex flex-col h-[320px] md:h-[360px]"
        >
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                Completed Services{statsServiceSuffix}
              </h3>
              <p className="text-sm text-gray-500 font-medium">Weekly completion trend</p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
              <CheckCircle size={18} />
            </div>
          </div>
          <div className="flex items-end justify-between gap-3 mb-4">
            <div>
              <p className="text-3xl font-black text-gray-900">{completedServicesWeeklyTotal.toLocaleString()}</p>
              {completedServicesWeeklyDeltaText && (
                <p className="text-xs font-semibold text-bird-blue">{completedServicesWeeklyDeltaText}</p>
              )}
            </div>
            <div className="px-3 py-1.5 rounded-full bg-bird-blue/10 text-bird-darkBlue text-xs font-bold border border-bird-blue/20">
              Last 7 days
            </div>
          </div>
          <div className="flex-1 w-full min-h-0">
            <StableResponsiveContainer>
              <AreaChart data={completedServicesWeekly} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="completedFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0090FF" stopOpacity={0.35}/>
                    <stop offset="95%" stopColor="#0090FF" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={adminChartTheme.grid} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: adminChartTheme.tick, fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: adminChartTheme.tick, fontSize: 12 }} />
                <Tooltip 
                  contentStyle={adminChartTheme.tooltip}
                  itemStyle={adminChartTheme.itemStyle}
                  labelStyle={{ color: adminChartTheme.tooltip.color }}
                />
                <Area type="monotone" name="Completed" dataKey="value" stroke="#0090FF" strokeWidth={3} fillOpacity={1} fill="url(#completedFill)" />
              </AreaChart>
            </StableResponsiveContainer>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="bg-white/70 backdrop-blur-xl rounded-3xl border border-white shadow-xl shadow-gray-200/20 p-6 flex flex-col h-[320px] md:h-[360px]"
        >
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Top Locations{statsServiceSuffix}</h3>
              <p className="text-sm text-gray-500 font-medium">Areas with most requests</p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-bird-orange/10 text-bird-orange flex items-center justify-center border border-bird-orange/20">
              <MapPin size={18} />
            </div>
          </div>
          <div className="flex-1 w-full min-h-0">
            <StableResponsiveContainer>
              <BarChart data={popularLocations} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }} barSize={10}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={adminChartTheme.grid} />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: adminChartTheme.tick, fontSize: 12 }} />
                <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: adminChartTheme.tick, fontSize: 12 }} width={90} />
                <Tooltip 
                  cursor={{ fill: adminChartTheme.cursor }}
                  contentStyle={adminChartTheme.tooltip}
                  itemStyle={adminChartTheme.itemStyle}
                  labelStyle={{ color: adminChartTheme.tooltip.color }}
                />
                <Bar dataKey="value" name="Requests" fill="#FFC20E" radius={[0, 6, 6, 0]} />
              </BarChart>
            </StableResponsiveContainer>
          </div>
        </motion.div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="lg:col-span-2 bg-white/70 backdrop-blur-xl rounded-3xl border border-white shadow-xl shadow-gray-200/20 p-6 flex flex-col h-[350px] md:h-[420px]"
        >
          <div className="flex justify-between items-end mb-6">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Revenue Overview{statsServiceSuffix}</h3>
              <p className="text-sm text-gray-500 font-medium">Monthly generated income vs projected</p>
            </div>
            <select className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-xl px-4 py-2 font-medium outline-none focus:ring-2 focus:ring-bird-blue/20">
              <option>Last 6 Months</option>
              <option>This Year</option>
              <option>All Time</option>
            </select>
          </div>
          <div className="flex-1 w-full min-h-0">
            <StableResponsiveContainer>
              <AreaChart data={dashboardStats?.revenueData || DEFAULT_REVENUE_DATA} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0090FF" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#0090FF" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorPv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FFC20E" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#FFC20E" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={adminChartTheme.grid} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: adminChartTheme.tick, fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: adminChartTheme.tick, fontSize: 12}} tickFormatter={(value) => `$${value}`} />
                <Tooltip 
                  contentStyle={adminChartTheme.tooltip}
                  itemStyle={adminChartTheme.itemStyle}
                  labelStyle={{ color: adminChartTheme.tooltip.color }}
                />
                <Legend iconType="circle" wrapperStyle={adminChartTheme.legendStyle} />
                <Area type="monotone" name="Actual Revenue" dataKey="uv" stroke="#0090FF" strokeWidth={3} fillOpacity={1} fill="url(#colorUv)" />
                <Area type="monotone" name="Projected" dataKey="pv" stroke="#FFC20E" strokeWidth={3} fillOpacity={1} fill="url(#colorPv)" />
              </AreaChart>
            </StableResponsiveContainer>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="bg-white/70 backdrop-blur-xl rounded-3xl border border-white shadow-xl shadow-gray-200/20 p-6 flex flex-col h-[350px] md:h-[420px]"
        >
          <div className="mb-6">
            <h3 className="text-xl font-bold text-gray-900">User Growth</h3>
            <p className="text-sm text-gray-500 font-medium">Weekly active registrations</p>
          </div>
          <div className="flex-1 w-full min-h-0">
            <StableResponsiveContainer>
              <BarChart data={dashboardStats?.trafficData || DEFAULT_TRAFFIC_DATA} margin={{ top: 10, right: 0, left: -25, bottom: 0 }} barSize={12}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={adminChartTheme.grid} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: adminChartTheme.tick, fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: adminChartTheme.tick, fontSize: 12}} />
                <Tooltip 
                  cursor={{fill: adminChartTheme.cursor}}
                  contentStyle={adminChartTheme.tooltip}
                  itemStyle={adminChartTheme.itemStyle}
                  labelStyle={{ color: adminChartTheme.tooltip.color }}
                />
                <Legend iconType="circle" wrapperStyle={adminChartTheme.legendStyle} />
                <Bar dataKey="Users" fill="#0090FF" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Pros" fill="#FF8000" radius={[4, 4, 0, 0]} />
              </BarChart>
            </StableResponsiveContainer>
          </div>
        </motion.div>
      </div>
    </div>
  );

  // ─── RENDER: Platform Settings Tab ───────────────────────────────────────
  const renderFinanceAnalyticsTab = () => (
    <div className="max-w-[1600px] mx-auto space-y-6 pb-10">
      <div className="bg-white/80 border border-gray-200 rounded-3xl p-6 md:p-8 shadow-lg">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-2xl font-black text-gray-900">Commission engine</h2>
            <p className="mt-1 text-gray-600">
              Define the default platform fee and add service-specific overrides without redeploying the app.
            </p>
          </div>
          <div className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
            Payment policy
          </div>
        </div>

        {commissionLoading ? (
          <div className="mt-6 rounded-3xl border border-dashed border-gray-200 bg-gray-50/70 px-4 py-10 text-center text-sm font-semibold text-gray-500">
            Loading commission policy...
          </div>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[0.42fr_0.58fr]">
              <label className="space-y-2">
                <span className="text-xs font-black uppercase tracking-[0.18em] text-gray-500">Default platform fee %</span>
                <input
                  type="number"
                  min={0}
                  max={50}
                  step="0.1"
                  value={commissionForm.global_rate_percent}
                  onChange={(e) =>
                    setCommissionForm((prev) => ({
                      ...prev,
                      global_rate_percent: e.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 font-semibold text-gray-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                />
              </label>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-emerald-50 to-white p-5">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Live default</p>
                  <p className="mt-3 text-3xl font-black text-gray-900">
                    {Number(
                      commissionConfig?.summary?.effective_default_rate_percent ??
                        commissionForm.global_rate_percent ??
                        0
                    ).toFixed(1)}%
                  </p>
                  <p className="mt-2 text-sm text-gray-500">Applied when a service does not have its own override.</p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white p-5">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-gray-400">Active service overrides</p>
                  <p className="mt-3 text-3xl font-black text-gray-900">{commissionConfig?.summary?.service_override_count || 0}</p>
                  <p className="mt-2 text-sm text-gray-500">Each override replaces the default fee for that service.</p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white p-5">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-gray-400">Urgency rules</p>
                  <p className="mt-3 text-3xl font-black text-gray-900">{commissionConfig?.summary?.urgency_rule_count || 0}</p>
                  <p className="mt-2 text-sm text-gray-500">These add a rush premium on urgent or emergency jobs.</p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white p-5">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-gray-400">Tier + promo rules</p>
                  <p className="mt-3 text-3xl font-black text-gray-900">
                    {(commissionConfig?.summary?.worker_tier_rule_count || 0) + (commissionConfig?.summary?.promo_rule_count || 0)}
                  </p>
                  <p className="mt-2 text-sm text-gray-500">Discount the platform fee for verified pros and active promo codes.</p>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-lg font-black text-gray-900">Service overrides</h3>
                  <p className="text-sm text-gray-500">Leave a field empty to inherit the global fee.</p>
                </div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                  {services.length} services available
                </p>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                {services.map((service) => (
                  <label
                    key={service.id_service}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white px-4 py-3"
                  >
                    <div>
                      <p className="font-black text-gray-900">{service.name}</p>
                      <p className="text-xs text-gray-500">
                        {service.description || 'This service currently inherits the platform default fee.'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={50}
                        step="0.1"
                        placeholder={commissionForm.global_rate_percent}
                        value={commissionForm.service_overrides[String(service.id_service)] ?? ''}
                        onChange={(e) =>
                          setCommissionForm((prev) => {
                            const nextOverrides = { ...prev.service_overrides };
                            const nextValue = e.target.value;
                            if (!nextValue.trim()) {
                              delete nextOverrides[String(service.id_service)];
                            } else {
                              nextOverrides[String(service.id_service)] = nextValue;
                            }
                            return { ...prev, service_overrides: nextOverrides };
                          })
                        }
                        className="w-24 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-right font-black text-gray-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                      />
                      <span className="text-xs font-black uppercase tracking-[0.18em] text-gray-400">%</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="rounded-3xl border border-gray-200 bg-slate-50/80 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-gray-900">Urgency adjustments</h3>
                    <p className="text-sm text-gray-500">Adds extra platform fee for faster-response requests.</p>
                  </div>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-amber-700">
                    additive
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {COMMISSION_URGENCY_OPTIONS.map((option) => (
                    <label
                      key={option.key}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white px-4 py-3"
                    >
                      <div>
                        <p className="font-black text-gray-900">{option.label}</p>
                        <p className="text-xs text-gray-500">{option.description}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black uppercase tracking-[0.18em] text-amber-600">+ fee</span>
                        <input
                          type="number"
                          min={0}
                          max={50}
                          step="0.1"
                          placeholder="0"
                          value={commissionForm.urgency_adjustments[option.key] ?? ''}
                          onChange={(e) =>
                            setCommissionForm((prev) => {
                              const next = { ...prev.urgency_adjustments };
                              if (!e.target.value.trim()) delete next[option.key];
                              else next[option.key] = e.target.value;
                              return { ...prev, urgency_adjustments: next };
                            })
                          }
                          className="w-24 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-right font-black text-gray-900 outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10"
                        />
                        <span className="text-xs font-black uppercase tracking-[0.18em] text-gray-400">%</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-gray-200 bg-slate-50/80 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-gray-900">Worker tier discounts</h3>
                    <p className="text-sm text-gray-500">Subtracts platform fee for better worker tiers.</p>
                  </div>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">
                    subtractive
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {COMMISSION_TIER_OPTIONS.map((option) => (
                    <label
                      key={option.key}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white px-4 py-3"
                    >
                      <div>
                        <p className="font-black text-gray-900">{option.label}</p>
                        <p className="text-xs text-gray-500">{option.description}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600">- fee</span>
                        <input
                          type="number"
                          min={0}
                          max={50}
                          step="0.1"
                          placeholder="0"
                          value={commissionForm.worker_tier_adjustments[option.key] ?? ''}
                          onChange={(e) =>
                            setCommissionForm((prev) => {
                              const next = { ...prev.worker_tier_adjustments };
                              if (!e.target.value.trim()) delete next[option.key];
                              else next[option.key] = e.target.value;
                              return { ...prev, worker_tier_adjustments: next };
                            })
                          }
                          className="w-24 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-right font-black text-gray-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                        />
                        <span className="text-xs font-black uppercase tracking-[0.18em] text-gray-400">%</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-3xl border border-gray-200 bg-slate-50/80 p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-lg font-black text-gray-900">Promo code discounts</h3>
                  <p className="text-sm text-gray-500">Promo codes reduce the platform fee on matching checkout sessions.</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setCommissionForm((prev) => ({
                      ...prev,
                      promo_codes: [...prev.promo_codes, { promo_code: '', rate_percent: '' }],
                    }))
                  }
                  className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700 hover:bg-emerald-100"
                >
                  Add promo code
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {commissionForm.promo_codes.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-6 text-sm font-semibold text-gray-500">
                    No promo rules yet. Add codes like WELCOME10 or VIPPRO to lower the fee on selected payments.
                  </div>
                ) : (
                  commissionForm.promo_codes.map((rule, index) => (
                    <div
                      key={`${rule.promo_code}-${index}`}
                      className="grid grid-cols-1 gap-3 rounded-2xl border border-gray-200 bg-white p-4 md:grid-cols-[1fr_180px_auto]"
                    >
                      <label className="space-y-2">
                        <span className="text-xs font-black uppercase tracking-[0.18em] text-gray-500">Promo code</span>
                        <input
                          value={rule.promo_code}
                          onChange={(e) =>
                            setCommissionForm((prev) => ({
                              ...prev,
                              promo_codes: prev.promo_codes.map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      promo_code: e.target.value.toUpperCase().replace(/\s+/g, ''),
                                    }
                                  : item
                              ),
                            }))
                          }
                          className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 font-black uppercase tracking-[0.16em] text-gray-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                          placeholder="WELCOME10"
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="text-xs font-black uppercase tracking-[0.18em] text-gray-500">Fee discount %</span>
                        <input
                          type="number"
                          min={0}
                          max={50}
                          step="0.1"
                          value={rule.rate_percent}
                          onChange={(e) =>
                            setCommissionForm((prev) => ({
                              ...prev,
                              promo_codes: prev.promo_codes.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, rate_percent: e.target.value } : item
                              ),
                            }))
                          }
                          className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 font-black text-gray-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                          placeholder="5"
                        />
                      </label>
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() =>
                            setCommissionForm((prev) => ({
                              ...prev,
                              promo_codes: prev.promo_codes.filter((_, itemIndex) => itemIndex !== index),
                            }))
                          }
                          className="w-full rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700 hover:bg-red-100 md:w-auto"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                onClick={handleSaveCommissionConfig}
                disabled={savingCommissionConfig || commissionLoading}
                className="px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-700 text-white font-black shadow-lg shadow-emerald-500/20 hover:scale-[1.02] transition-transform disabled:opacity-60"
              >
                {savingCommissionConfig ? 'Saving...' : 'Save commission engine'}
              </button>
              <span className="text-sm font-semibold text-gray-500">
                The selected rate is snapshotted on each payment, so future edits do not rewrite old orders.
              </span>
            </div>
          </>
        )}
      </div>

      <div className="bg-white/80 border border-gray-200 rounded-3xl p-6 md:p-8 shadow-lg">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className="text-2xl font-black text-gray-900">Settlement and invoicing</h2>
            <p className="mt-1 text-gray-600">
              Review settled volume, platform revenue, scheduled settlements and recent invoices for any date window.
            </p>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <label className="space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-gray-500">From</span>
              <input
                type="date"
                value={financeReportRange.from}
                onChange={(e) => setFinanceReportRange((prev) => ({ ...prev, from: e.target.value }))}
                className="rounded-2xl border border-gray-200 bg-white px-4 py-3 font-semibold text-gray-900 outline-none focus:border-bird-blue focus:ring-4 focus:ring-bird-blue/10"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-gray-500">To</span>
              <input
                type="date"
                value={financeReportRange.to}
                onChange={(e) => setFinanceReportRange((prev) => ({ ...prev, to: e.target.value }))}
                className="rounded-2xl border border-gray-200 bg-white px-4 py-3 font-semibold text-gray-900 outline-none focus:border-bird-blue focus:ring-4 focus:ring-bird-blue/10"
              />
            </label>
            <button
              type="button"
              onClick={() => fetchFinanceReportAdmin()}
              disabled={financeReportLoading}
              className="rounded-2xl border border-bird-blue/20 bg-bird-blue/10 px-5 py-3 text-sm font-black text-bird-darkBlue hover:bg-bird-blue/15 disabled:opacity-60"
            >
              {financeReportLoading ? 'Loading...' : 'Load report'}
            </button>
            <button
              type="button"
              onClick={handleExportFinanceReport}
              disabled={exportingFinanceReport}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-black text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
            >
              <Download size={16} />
              {exportingFinanceReport ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>
        </div>

        {financeReportLoading && !financeReport ? (
          <div className="mt-6 rounded-3xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm font-semibold text-gray-500">
            Loading settlement report...
          </div>
        ) : financeReport ? (
          <>
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-bird-blue/10 to-white p-5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-bird-blue">Gross volume</p>
                <p className="mt-3 text-3xl font-black text-gray-900">{`$${Number(financeReport.summary.gross_volume || 0).toFixed(2)}`}</p>
                <p className="mt-2 text-sm text-gray-500">{financeReport.summary.invoice_count} invoices in range</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-gray-400">Platform revenue</p>
                <p className="mt-3 text-3xl font-black text-gray-900">{`$${Number(financeReport.summary.platform_revenue || 0).toFixed(2)}`}</p>
                <p className="mt-2 text-sm text-gray-500">Captured in posted fee entries.</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-gray-400">Scheduled settlements</p>
                <p className="mt-3 text-3xl font-black text-gray-900">{`$${Number(financeReport.summary.scheduled_settlement_total || 0).toFixed(2)}`}</p>
                <p className="mt-2 text-sm text-gray-500">Includes base payouts waiting for release.</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-gray-400">Paid settlements</p>
                <p className="mt-3 text-3xl font-black text-gray-900">{`$${Number((financeReport.summary.worker_paid || 0) + (financeReport.summary.bonus_paid || 0)).toFixed(2)}`}</p>
                <p className="mt-2 text-sm text-gray-500">Worker payouts and bonuses marked as paid.</p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[0.85fr_1.15fr]">
              <div className="rounded-3xl border border-gray-200 bg-slate-50/70 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-gray-900">Top services in range</h3>
                    <p className="text-sm text-gray-500">Where the billing volume is concentrating right now.</p>
                  </div>
                  <div className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-gray-500">
                    {financeReport.range.days} days
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {financeReport.service_breakdown.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-6 text-sm font-semibold text-gray-500">
                      No billed services were found in this range.
                    </div>
                  ) : (
                    financeReport.service_breakdown.map((item) => (
                      <div key={item.service_name} className="rounded-2xl border border-gray-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-black text-gray-900">{item.service_name}</p>
                            <p className="mt-1 text-xs font-semibold text-gray-500">{item.invoices} invoice(s)</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-black text-gray-900">{`$${Number(item.gross_volume || 0).toFixed(2)}`}</p>
                            <p className="mt-1 text-xs text-gray-500">{`Fee $${Number(item.platform_revenue || 0).toFixed(2)} / Paid out $${Number(item.settled_payouts || 0).toFixed(2)}`}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-gray-200 bg-slate-50/70 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-gray-900">Recent invoices</h3>
                    <p className="text-sm text-gray-500">Latest paid jobs in the selected settlement window.</p>
                  </div>
                  <div className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-gray-500">
                    email-ready
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {financeReport.invoices.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-6 text-sm font-semibold text-gray-500">
                      No invoices were paid in this range yet.
                    </div>
                  ) : (
                    financeReport.invoices.slice(0, 8).map((invoice) => (
                      <div key={invoice.id_payment} className="rounded-2xl border border-gray-200 bg-white p-4">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-base font-black text-gray-900">{invoice.invoice_number}</p>
                              <span className="rounded-full border border-bird-blue/15 bg-bird-blue/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-bird-darkBlue">
                                {invoice.provider}
                              </span>
                              {invoice.promo_code && (
                                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">
                                  {invoice.promo_code}
                                </span>
                              )}
                            </div>
                            <p className="mt-2 text-sm font-black text-gray-900">{invoice.service_name}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-500">
                              <span>{invoice.customer_name}</span>
                              {invoice.customer_email && <span>{`/ ${invoice.customer_email}`}</span>}
                              <span>{`/ ${new Date(invoice.paid_at).toLocaleDateString()}`}</span>
                              <span>{`/ ${invoice.urgency_level}`}</span>
                            </div>
                            {invoice.policy_label && (
                              <p className="mt-2 text-xs text-gray-500">{invoice.policy_label}</p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-black text-gray-900">{`${invoice.currency_code} $${Number(invoice.amount || 0).toFixed(2)}`}</p>
                            <p className="mt-1 text-xs text-gray-500">{`Fee $${Number(invoice.platform_fee || 0).toFixed(2)} / Worker $${Number(invoice.worker_payout || 0).toFixed(2)}`}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="mt-6 rounded-3xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm font-semibold text-gray-500">
            Load a date range to see settlement summaries, invoices and exportable finance data.
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="bg-white/80 border border-gray-200 rounded-3xl p-6 shadow-lg">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-black text-gray-900">Financial close and reconciliation</h2>
              <p className="mt-1 text-gray-600">
                Weekly or monthly closing view with discrepancy checks between captured payments and ledger rows.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={financeClosurePeriod}
                onChange={(e) => setFinanceClosurePeriod(e.target.value as 'weekly' | 'monthly')}
                className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-bold text-gray-900"
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
              <button
                type="button"
                onClick={() => fetchFinanceClosureReport(financeClosurePeriod)}
                disabled={financeClosureLoading}
                className="rounded-2xl border border-bird-blue/20 bg-bird-blue/10 px-5 py-3 text-sm font-black text-bird-darkBlue disabled:opacity-60"
              >
                {financeClosureLoading ? 'Loading...' : 'Refresh close'}
              </button>
            </div>
          </div>

          {financeClosureLoading && !financeClosureReport ? (
            <div className="mt-6 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-sm font-semibold text-gray-500">
              Loading close report...
            </div>
          ) : financeClosureReport ? (
            <>
              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-gray-200 bg-slate-50/60 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-gray-500">Net platform</p>
                  <p className="mt-2 text-2xl font-black text-gray-900">{`$${Number(financeClosureReport.summary.net_platform || 0).toFixed(2)}`}</p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-slate-50/60 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-gray-500">Open cases</p>
                  <p className="mt-2 text-2xl font-black text-gray-900">{financeClosureReport.summary.open_case_count || 0}</p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-slate-50/60 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-gray-500">Discrepancies</p>
                  <p className="mt-2 text-2xl font-black text-gray-900">{financeClosureReport.summary.discrepancy_count || 0}</p>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {financeClosureReport.periods.map((period) => (
                  <div key={period.period_key} className="rounded-2xl border border-gray-200 bg-white p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-black text-gray-900">{period.period_key}</p>
                        <p className="text-xs text-gray-500">{`Gross $${period.gross_volume.toFixed(2)} / Fee $${period.platform_fee.toFixed(2)} / Adjustments $${period.adjustments_total.toFixed(2)}`}</p>
                      </div>
                      <p className="text-sm font-black text-gray-900">{`Net platform $${period.net_platform.toFixed(2)}`}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6">
                <h3 className="text-lg font-black text-gray-900">Discrepancies</h3>
                <div className="mt-3 space-y-3">
                  {financeClosureReport.discrepancies.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm font-semibold text-gray-500">
                      No ledger discrepancies for this range.
                    </div>
                  ) : (
                    financeClosureReport.discrepancies.map((item) => (
                      <div key={item.id_payment} className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                        <p className="font-black text-gray-900">{`Payment #${item.id_payment} / Request #${item.id_request}`}</p>
                        <p className="mt-1 text-xs text-gray-600">{`Expected $${item.expected_amount.toFixed(2)} vs ledger charge $${item.ledger_customer_charge.toFixed(2)}`}</p>
                        <p className="mt-1 text-xs text-gray-600">{`Expected fee $${item.expected_platform_fee.toFixed(2)} vs ledger fee $${item.ledger_platform_fee.toFixed(2)}`}</p>
                        <p className="mt-1 text-xs text-gray-600">{`Expected payout $${item.expected_worker_payout.toFixed(2)} vs ledger release $${item.ledger_worker_release.toFixed(2)}`}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>

        <div className="bg-white/80 border border-gray-200 rounded-3xl p-6 shadow-lg">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black text-gray-900">Finance cases</h2>
              <p className="mt-1 text-gray-600">Create refunds, disputes or adjustments and resolve them into the ledger.</p>
            </div>
            <button
              type="button"
              onClick={fetchFinanceCases}
              disabled={financeCasesLoading}
              className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-black text-gray-700 disabled:opacity-60"
            >
              Refresh
            </button>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
            <select value={financeCaseForm.case_type} onChange={(e) => setFinanceCaseForm((prev) => ({ ...prev, case_type: e.target.value }))} className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900">
              <option value="refund">Refund</option>
              <option value="dispute">Dispute</option>
              <option value="adjustment">Adjustment</option>
            </select>
            <select value={financeCaseForm.direction} onChange={(e) => setFinanceCaseForm((prev) => ({ ...prev, direction: e.target.value }))} className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900">
              <option value="customer_refund">Customer refund</option>
              <option value="platform_credit">Platform credit</option>
              <option value="platform_debit">Platform debit</option>
              <option value="worker_hold">Worker hold</option>
              <option value="worker_release">Worker release</option>
            </select>
            <input value={financeCaseForm.id_request} onChange={(e) => setFinanceCaseForm((prev) => ({ ...prev, id_request: e.target.value }))} placeholder="Request ID" className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900" />
            <input value={financeCaseForm.id_payment} onChange={(e) => setFinanceCaseForm((prev) => ({ ...prev, id_payment: e.target.value }))} placeholder="Payment ID" className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900" />
            <input value={financeCaseForm.amount} onChange={(e) => setFinanceCaseForm((prev) => ({ ...prev, amount: e.target.value }))} placeholder="Amount" className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900" />
            <input value={financeCaseForm.currency_code} onChange={(e) => setFinanceCaseForm((prev) => ({ ...prev, currency_code: e.target.value }))} placeholder="Currency" className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900" />
            <input value={financeCaseForm.reason} onChange={(e) => setFinanceCaseForm((prev) => ({ ...prev, reason: e.target.value }))} placeholder="Reason" className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 md:col-span-2" />
            <textarea value={financeCaseForm.notes} onChange={(e) => setFinanceCaseForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Notes" className="min-h-[90px] rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 md:col-span-2" />
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={handleCreateFinanceCase}
              disabled={creatingFinanceCase}
              className="rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-700 px-5 py-3 text-sm font-black text-white shadow-lg shadow-emerald-500/20 disabled:opacity-60"
            >
              {creatingFinanceCase ? 'Creating...' : 'Create finance case'}
            </button>
          </div>

          <div className="mt-6 space-y-3">
            {financeCasesLoading ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm font-semibold text-gray-500">
                Loading finance cases...
              </div>
            ) : financeCases.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm font-semibold text-gray-500">
                No finance cases yet.
              </div>
            ) : (
              financeCases.map((item) => (
                <div key={item.id_case} className="rounded-2xl border border-gray-200 bg-slate-50/60 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-black text-gray-900">{`${item.case_type} #${item.id_case}`}</p>
                        <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-gray-600">
                          {item.case_status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-600">{item.reason || 'No reason'}</p>
                      <p className="mt-1 text-xs text-gray-500">{`${item.direction} / ${item.currency_code} $${Number(item.amount || 0).toFixed(2)}`}</p>
                      <p className="mt-1 text-xs text-gray-500">{`Request ${item.id_request || '-'} / Payment ${item.id_payment || '-'}`}</p>
                    </div>
                    {item.case_status === 'open' && (
                      <button
                        type="button"
                        onClick={() => handleResolveFinanceCase(item.id_case)}
                        disabled={resolvingFinanceCaseId === item.id_case}
                        className="rounded-2xl border border-bird-blue/20 bg-bird-blue/10 px-4 py-2 text-sm font-black text-bird-darkBlue disabled:opacity-60"
                      >
                        {resolvingFinanceCaseId === item.id_case ? 'Resolving...' : 'Resolve'}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="bg-white/80 border border-gray-200 rounded-3xl p-6 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black text-gray-900">System events</h2>
              <p className="mt-1 text-gray-600">Operational observability for finance, webhooks and jobs.</p>
            </div>
            <button type="button" onClick={fetchSystemEvents} disabled={systemEventsLoading} className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-black text-gray-700 disabled:opacity-60">
              Refresh
            </button>
          </div>
          <div className="mt-6 space-y-3">
            {systemEventsLoading ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm font-semibold text-gray-500">Loading events...</div>
            ) : systemEvents.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm font-semibold text-gray-500">No system events recorded yet.</div>
            ) : (
              systemEvents.map((event) => (
                <div key={event.id_event} className="rounded-2xl border border-gray-200 bg-slate-50/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-gray-900">{event.message}</p>
                      <p className="mt-1 text-xs text-gray-500">{`${event.component} / ${event.event_type}`}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] ${
                      event.level === 'critical' ? 'bg-red-100 text-red-700' :
                      event.level === 'error' ? 'bg-rose-100 text-rose-700' :
                      event.level === 'warning' ? 'bg-amber-100 text-amber-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {event.level}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">{new Date(event.created_at).toLocaleString()}</p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white/80 border border-gray-200 rounded-3xl p-6 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black text-gray-900">Background jobs</h2>
              <p className="mt-1 text-gray-600">Email, payout and webhook queue health with retry visibility.</p>
            </div>
            <button type="button" onClick={fetchBackgroundJobs} disabled={backgroundJobsLoading} className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-black text-gray-700 disabled:opacity-60">
              Refresh
            </button>
          </div>
          <div className="mt-6 space-y-3">
            {backgroundJobsLoading ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm font-semibold text-gray-500">Loading jobs...</div>
            ) : backgroundJobs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm font-semibold text-gray-500">No background jobs queued yet.</div>
            ) : (
              backgroundJobs.map((job) => (
                <div key={job.id_job} className="rounded-2xl border border-gray-200 bg-slate-50/60 p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-black text-gray-900">{job.job_type}</p>
                      <p className="mt-1 text-xs text-gray-500">{`Attempts ${job.attempts_made}/${job.attempts_max} / Run after ${new Date(job.run_after).toLocaleString()}`}</p>
                      {job.last_error && <p className="mt-1 text-xs text-rose-600">{job.last_error}</p>}
                    </div>
                    <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-gray-600">
                      {job.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-6">
        <div className="bg-white/80 border border-gray-200 rounded-3xl p-6 md:p-8 shadow-lg">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black text-gray-900">Worker rewards program</h2>
              <p className="text-gray-600 mt-1">
                Control the commission unlock, royalty target, and recurring bonus percentages without touching code.
              </p>
            </div>
            <div className="rounded-full border border-bird-blue/20 bg-bird-blue/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-bird-darkBlue">
              Admin control
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-gray-500">Trial completed jobs</span>
              <input type="number" min={1} value={workerRewardsSettingsForm.trial_min_completed_jobs} onChange={(e) => setWorkerRewardsSettingsForm((prev) => ({ ...prev, trial_min_completed_jobs: e.target.value }))} className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 font-semibold text-gray-900 outline-none focus:border-bird-blue focus:ring-4 focus:ring-bird-blue/10" />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-gray-500">Commission rate %</span>
              <input type="number" min={0} max={100} step="0.1" value={workerRewardsSettingsForm.commission_rate_percent} onChange={(e) => setWorkerRewardsSettingsForm((prev) => ({ ...prev, commission_rate_percent: e.target.value }))} className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 font-semibold text-gray-900 outline-none focus:border-bird-blue focus:ring-4 focus:ring-bird-blue/10" />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-gray-500">Royalty min jobs</span>
              <input type="number" min={1} value={workerRewardsSettingsForm.royalty_min_jobs} onChange={(e) => setWorkerRewardsSettingsForm((prev) => ({ ...prev, royalty_min_jobs: e.target.value }))} className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 font-semibold text-gray-900 outline-none focus:border-bird-blue focus:ring-4 focus:ring-bird-blue/10" />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-gray-500">Royalty completion %</span>
              <input type="number" min={0} max={100} step="0.1" value={workerRewardsSettingsForm.royalty_min_completion_rate} onChange={(e) => setWorkerRewardsSettingsForm((prev) => ({ ...prev, royalty_min_completion_rate: e.target.value }))} className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 font-semibold text-gray-900 outline-none focus:border-bird-blue focus:ring-4 focus:ring-bird-blue/10" />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-gray-500">Royalty rate %</span>
              <input type="number" min={0} max={100} step="0.1" value={workerRewardsSettingsForm.royalty_rate_percent} onChange={(e) => setWorkerRewardsSettingsForm((prev) => ({ ...prev, royalty_rate_percent: e.target.value }))} className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 font-semibold text-gray-900 outline-none focus:border-bird-blue focus:ring-4 focus:ring-bird-blue/10" />
            </label>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button onClick={handleSaveWorkerRewardsSettings} disabled={savingWorkerRewardsSettings} className="px-6 py-3 rounded-2xl bg-gradient-to-r from-bird-blue to-bird-darkBlue text-white font-black shadow-lg shadow-bird-blue/20 hover:scale-[1.02] transition-transform disabled:opacity-60">
              {savingWorkerRewardsSettings ? 'Saving...' : 'Save rewards program'}
            </button>
            {workerRewardsSettings && (
              <span className="text-sm font-semibold text-gray-500">
                Current live policy: {Math.round(workerRewardsSettings.commission_rate * 100)}% commission, {Math.round(workerRewardsSettings.royalty_rate * 100)}% royalty.
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white/80 border border-gray-200 rounded-3xl p-6 shadow-lg">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-gray-400">Scheduled bonuses</p>
            <p className="mt-3 text-3xl font-black text-gray-900">{workerRewardsSummary?.scheduled_count || 0}</p>
            <p className="mt-2 text-sm text-gray-500">{`$${Number(workerRewardsSummary?.scheduled_amount || 0).toFixed(2)} pending to pay`}</p>
          </div>
          <div className="bg-white/80 border border-gray-200 rounded-3xl p-6 shadow-lg">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-gray-400">Paid bonuses</p>
            <p className="mt-3 text-3xl font-black text-gray-900">{workerRewardsSummary?.paid_count || 0}</p>
            <p className="mt-2 text-sm text-gray-500">{`$${Number(workerRewardsSummary?.paid_amount || 0).toFixed(2)} already released`}</p>
          </div>
          <div className="bg-white/80 border border-gray-200 rounded-3xl p-6 shadow-lg">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-gray-400">Total bonus rows</p>
            <p className="mt-3 text-3xl font-black text-gray-900">{workerRewardsSummary?.total_rows || 0}</p>
            <p className="mt-2 text-sm text-gray-500">{`$${Number(workerRewardsSummary?.total_bonus_amount || 0).toFixed(2)} generated`}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[0.92fr_1.08fr] gap-6">
        <div className="bg-white/80 border border-gray-200 rounded-3xl p-6 shadow-lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="text-xl font-black text-gray-900">Base worker payouts</h3>
              <p className="mt-1 text-sm text-gray-500">
                These are the core payouts created when customer funds are released after job completion.
              </p>
            </div>
            <div className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
              ledger-backed
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-gray-400">Scheduled</p>
              <p className="mt-3 text-3xl font-black text-gray-900">{workerPayoutsSummary?.scheduled_count || 0}</p>
              <p className="mt-2 text-sm text-gray-500">{`$${Number(workerPayoutsSummary?.scheduled_amount || 0).toFixed(2)} waiting to be paid`}</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-gray-400">Paid</p>
              <p className="mt-3 text-3xl font-black text-gray-900">{workerPayoutsSummary?.paid_count || 0}</p>
              <p className="mt-2 text-sm text-gray-500">{`$${Number(workerPayoutsSummary?.paid_amount || 0).toFixed(2)} already released`}</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-gray-400">All base payouts</p>
              <p className="mt-3 text-3xl font-black text-gray-900">{workerPayoutsSummary?.total_rows || 0}</p>
              <p className="mt-2 text-sm text-gray-500">{`$${Number(workerPayoutsSummary?.total_amount || 0).toFixed(2)} total tracked`}</p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {workerPayoutsLoading ? (
              <div className="rounded-3xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm font-semibold text-gray-500">
                Loading worker payouts...
              </div>
            ) : workerPayouts.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm font-semibold text-gray-500">
                No worker payouts match this filter yet.
              </div>
            ) : (
              workerPayouts.slice(0, 6).map((payout) => (
                <div key={payout.id_worker_payout} className="rounded-3xl border border-gray-200 bg-gray-50 p-4 md:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-black text-gray-900">{payout.worker_name}</p>
                        <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] ${
                          payout.payout_status === 'paid'
                            ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                            : payout.payout_status === 'cancelled'
                              ? 'border border-gray-200 bg-gray-100 text-gray-500'
                              : 'border border-amber-200 bg-amber-50 text-amber-700'
                        }`}>
                          {payout.payout_status}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-gray-500">
                        {payout.service_name ? payout.service_name : 'Service payout'}
                        {payout.location_text ? ` / ${payout.location_text}` : ''}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-500">
                        <span>{`Gross: $${Number(payout.gross_amount || 0).toFixed(2)}`}</span>
                        <span>{` / Fee: $${Number(payout.platform_fee || 0).toFixed(2)}`}</span>
                        <span>{` / Scheduled: ${new Date(payout.scheduled_for).toLocaleDateString()}`}</span>
                        {payout.paid_at && <span>{` / Paid: ${new Date(payout.paid_at).toLocaleDateString()}`}</span>}
                      </div>
                    </div>

                    <div className="flex flex-col items-start gap-3 md:items-end">
                      <div className="text-right">
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-gray-400">Net payout</p>
                        <p className="mt-1 text-2xl font-black text-gray-900">{`$${Number(payout.net_amount || 0).toFixed(2)}`}</p>
                      </div>
                      {payout.payout_status !== 'paid' ? (
                        <button
                          onClick={() => handleMarkWorkerPayoutPaid(payout.id_worker_payout)}
                          disabled={markingWorkerPayoutId === payout.id_worker_payout}
                          className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-black text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                        >
                          {markingWorkerPayoutId === payout.id_worker_payout ? 'Updating...' : 'Mark as paid'}
                        </button>
                      ) : (
                        <div className="flex flex-wrap justify-start gap-2 md:justify-end">
                          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">
                            Already paid
                          </div>
                          <button
                            type="button"
                            onClick={() => handleResendWorkerStatement(payout.id_user)}
                            disabled={resendingStatementUserId === payout.id_user}
                            className="rounded-2xl border border-bird-blue/20 bg-bird-blue/10 px-4 py-3 text-sm font-black text-bird-darkBlue hover:bg-bird-blue/15 disabled:opacity-60"
                          >
                            {resendingStatementUserId === payout.id_user ? 'Resending...' : 'Resend statement'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white/80 border border-gray-200 rounded-3xl p-6 shadow-lg">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-xl font-black text-gray-900">Recent payment ledger</h3>
              <p className="mt-1 text-sm text-gray-500">
                Every charge, fee, escrow movement and payout release is snapshotted here for auditability.
              </p>
            </div>
            <div className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-gray-500">
              last 40 events
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {paymentLedgerLoading ? (
              <div className="rounded-3xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm font-semibold text-gray-500">
                Loading payment ledger...
              </div>
            ) : paymentLedgerEntries.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm font-semibold text-gray-500">
                No ledger events yet.
              </div>
            ) : (
              paymentLedgerEntries.slice(0, 8).map((entry) => (
                <div key={entry.id_ledger_entry} className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-bird-blue/15 bg-bird-blue/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-bird-darkBlue">
                          {entry.entry_type.replace(/_/g, ' ')}
                        </span>
                        <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] ${
                          entry.entry_status === 'posted'
                            ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                            : entry.entry_status === 'scheduled'
                              ? 'border border-amber-200 bg-amber-50 text-amber-700'
                              : 'border border-gray-200 bg-gray-100 text-gray-500'
                        }`}>
                          {entry.entry_status}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-black text-gray-900">
                        {entry.service_name || 'Platform payment event'}
                        {entry.location_text ? ` / ${entry.location_text}` : ''}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-500">
                        {entry.id_request && <span>{`Request #${entry.id_request}`}</span>}
                        {entry.id_worker_payout && <span>{` / Payout #${entry.id_worker_payout}`}</span>}
                        {entry.available_on && <span>{` / Available: ${new Date(entry.available_on).toLocaleDateString()}`}</span>}
                        <span>{` / Logged: ${new Date(entry.created_at).toLocaleDateString()}`}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-gray-400">Amount</p>
                      <p className="mt-1 text-xl font-black text-gray-900">
                        {`${entry.currency_code || 'USD'} $${Number(entry.amount || 0).toFixed(2)}`}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="bg-white/80 border border-gray-200 rounded-3xl p-6 shadow-lg">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-xl font-black text-gray-900">Bonus payout ledger</h3>
            <p className="text-sm text-gray-500 mt-1">
              Mark payouts as paid when the worker actually receives the bonus. Scheduled items stay visible until you clear them.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['all', 'scheduled', 'paid', 'cancelled'] as const).map((status) => (
              <button key={status} onClick={() => setWorkerRewardsStatus(status)} className={`px-4 py-2 rounded-full text-xs font-black uppercase tracking-[0.18em] transition-all ${workerRewardsStatus === status ? 'bg-bird-blue text-white shadow-lg shadow-bird-blue/20' : 'border border-gray-200 bg-white text-gray-500 hover:border-bird-blue/20 hover:text-bird-blue'}`}>
                {status}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {workerRewardsLoading ? (
            <div className="rounded-3xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm font-semibold text-gray-500">
              Loading rewards ledger...
            </div>
          ) : workerRewardsPayouts.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm font-semibold text-gray-500">
              No bonus payouts match this filter yet.
            </div>
          ) : (
            workerRewardsPayouts.map((payout) => (
              <div key={payout.id_bonus_payout} className="rounded-3xl border border-gray-200 bg-gray-50 p-4 md:p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-black text-gray-900">{payout.worker_name}</p>
                      <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] ${payout.bonus_type === 'royalty' ? 'border border-purple-200 bg-purple-50 text-purple-700' : 'border border-bird-blue/20 bg-bird-blue/10 text-bird-darkBlue'}`}>
                        {payout.bonus_type}
                      </span>
                      <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] ${payout.payout_status === 'paid' ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : payout.payout_status === 'cancelled' ? 'border border-gray-200 bg-gray-100 text-gray-500' : 'border border-amber-200 bg-amber-50 text-amber-700'}`}>
                        {payout.payout_status}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-gray-500">
                      {`Cycle ${payout.cycle_key}`}
                      {payout.service_name ? ` / ${payout.service_name}` : ''}
                      {payout.location_text ? ` / ${payout.location_text}` : ''}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-500">
                      <span>{`Base: $${Number(payout.base_amount || 0).toFixed(2)}`}</span>
                      <span>{` / Scheduled: ${new Date(payout.scheduled_for).toLocaleDateString()}`}</span>
                      {payout.paid_at && <span>{` / Paid: ${new Date(payout.paid_at).toLocaleDateString()}`}</span>}
                    </div>
                  </div>

                  <div className="flex flex-col items-start gap-3 md:items-end">
                    <div className="text-right">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-gray-400">Bonus amount</p>
                      <p className="mt-1 text-2xl font-black text-gray-900">{`$${Number(payout.bonus_amount || 0).toFixed(2)}`}</p>
                    </div>
                    {payout.payout_status !== 'paid' ? (
                      <button onClick={() => handleMarkBonusPaid(payout.id_bonus_payout)} disabled={markingPayoutId === payout.id_bonus_payout} className="px-5 py-3 rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-700 font-black hover:bg-emerald-100 transition-all disabled:opacity-60">
                        {markingPayoutId === payout.id_bonus_payout ? 'Updating...' : 'Mark as paid'}
                      </button>
                    ) : (
                      <div className="flex flex-wrap justify-start gap-2 md:justify-end">
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">
                          Already paid
                        </div>
                        <button
                          type="button"
                          onClick={() => handleResendWorkerStatement(payout.id_user)}
                          disabled={resendingStatementUserId === payout.id_user}
                          className="rounded-2xl border border-bird-blue/20 bg-bird-blue/10 px-4 py-3 text-sm font-black text-bird-darkBlue hover:bg-bird-blue/15 disabled:opacity-60"
                        >
                          {resendingStatementUserId === payout.id_user ? 'Resending...' : 'Resend statement'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  const renderPlatformSettingsTab = () => (
    <div className="max-w-[1600px] mx-auto space-y-6 pb-10">
      <div className="bg-white/80 border border-gray-200 rounded-3xl p-6 md:p-8 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-gray-900">Homepage Carousel Manager</h2>
            <p className="text-gray-600 mt-1">
              Update hero slides (text + image) from admin. Images are auto-cropped to 16:9.
            </p>
          </div>
          <div className="flex flex-wrap md:flex-nowrap gap-2 md:gap-3">
            <button
              onClick={handleAddSlide}
              disabled={isSavingHeroSlides}
              className="flex-1 md:flex-none px-4 py-2.5 rounded-xl border border-bird-blue bg-bird-blue/10 text-bird-darkBlue font-bold text-xs md:text-sm hover:bg-bird-blue/20 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-300 transition-all"
            >
              + Add Slide
            </button>
            <button
              onClick={handleResetHeroSlides}
              disabled={isSavingHeroSlides}
              className="flex-1 md:flex-none px-4 py-2.5 rounded-xl border border-gray-300 bg-white text-gray-700 font-bold text-xs md:text-sm hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 transition-all"
            >
              Restore Default
            </button>
            <button
              onClick={handleSaveHeroSlides}
              disabled={isSavingHeroSlides}
              className="w-full md:w-auto px-6 py-2.5 rounded-xl bg-bird-blue text-white font-bold text-xs md:text-sm hover:bg-bird-darkBlue disabled:bg-gray-300 shadow-lg shadow-bird-blue/20 transition-all"
            >
              {isSavingHeroSlides ? 'Saving...' : 'Save Carousel'}
            </button>
          </div>
        </div>

        {settingsNotice && (
          <div className="mt-4 rounded-xl border border-bird-blue/20 bg-bird-blue/10 text-bird-darkBlue px-4 py-3 text-sm font-semibold">
            {settingsNotice}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {heroSlidesDraft.map((slide, index) => (
          <div
            key={slide.id}
            className="bg-white/80 border border-gray-200 rounded-3xl p-5 md:p-6 shadow-lg space-y-4 hover:shadow-xl transition-all"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-gray-900">Slide {index + 1}</h3>
              <div className="flex items-center gap-2">
                {unsavedSlideIds.includes(slide.id) && (
                  <span className="text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                    Unsaved
                  </span>
                )}
                <span className="text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                  16:9
                </span>
                <button
                  onClick={() => handleDeleteSlide(slide.id)}
                  disabled={isSavingHeroSlides || heroSlidesDraft.length <= 1}
                  className="text-xs font-bold px-2.5 py-1 rounded-full border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-300"
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="aspect-video rounded-2xl overflow-hidden border border-gray-200 bg-gray-100 shadow-inner">
              {slide.image ? (
                <img src={slide.image} alt={`Slide ${index + 1}`} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex flex-col items-center justify-center text-gray-500">
                  <div className="text-3xl font-black text-bird-blue leading-none">+</div>
                  <div className="text-sm font-bold mt-2">No image selected</div>
                  <div className="text-xs">Upload below</div>
                </div>
              )}
            </div>

            <label className="block">
              <span className="block text-xs font-bold text-gray-500 uppercase mb-1">Replace Image</span>
              <div className="w-full rounded-2xl border-2 border-dashed border-gray-300 bg-gradient-to-br from-white to-sky-50 hover:from-sky-50 hover:to-blue-50 hover:border-bird-blue transition p-4 text-center cursor-pointer">
                <div className="text-bird-blue text-2xl font-black leading-none">+</div>
                <div className="text-gray-900 font-black mt-1">Image Upload Zone</div>
                <div className="text-xs text-gray-500">PNG/JPG/WEBP, auto-center crop to 1600 x 900</div>
                <span className="inline-block mt-3 bg-bird-blue text-white px-3 py-1.5 rounded-lg text-sm font-bold shadow">
                  {uploadingSlideId === slide.id ? 'Uploading...' : 'Select Image'}
                </span>
              </div>
              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                onChange={(e) => handleImageUpload(index, e)}
                className="hidden"
              />
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs font-bold text-gray-500 uppercase mb-1">Tag</span>
                <input
                  value={slide.tag}
                  onChange={(e) => updateSlideField(index, 'tag', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5"
                />
              </label>

              <label className="block">
                <span className="block text-xs font-bold text-gray-500 uppercase mb-1">Button Text</span>
                <input
                  value={slide.cta}
                  onChange={(e) => updateSlideField(index, 'cta', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5"
                />
              </label>
            </div>

            <label className="block">
              <span className="block text-xs font-bold text-gray-500 uppercase mb-1">Title</span>
              <input
                value={slide.title}
                onChange={(e) => updateSlideField(index, 'title', e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5"
              />
            </label>

            <label className="block">
              <span className="block text-xs font-bold text-gray-500 uppercase mb-1">Description</span>
              <textarea
                value={slide.description}
                onChange={(e) => updateSlideField(index, 'description', e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5"
              />
            </label>
          </div>
        ))}
      </div>
    </div>
  );

  // Tab content router
  const renderTabContent = () => {
    switch (activeTab) {
      case 'Services': return renderServicesTab();
      case 'Homepage Cards': return renderServicesTab();
      case 'Users & Pros': return renderUsersTab();
      case 'Requests History': return renderRequestsHistoryTab();
      case 'Finance Analytics': return renderFinanceAnalyticsTab();
      case 'Admin Activity': return renderAdminActivityTab();
      case 'Platform Settings': return renderPlatformSettingsTab();
      default: return renderOverviewTab();
    }
  };

  const fetchRequestsHistory = async (
    status: 'all' | 'pending' | 'assigned' | 'in_progress' | 'done' | 'cancelled' = requestHistoryStatus,
    serviceId: 'all' | string = requestHistoryServiceId
  ) => {
    setRequestHistoryLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('status', status);
      if (serviceId !== 'all') params.set('service_id', String(serviceId));
      const res = await fetch(`${API_ENDPOINTS.admin.requestsHistory}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.requests)) {
        setRequestHistory(data.requests);
      }
    } catch {
      // silent
    } finally {
      setRequestHistoryLoading(false);
    }
  };

  const hydrateWorkerRewardsSettingsForm = (settings: AdminWorkerRewardsSettings) => {
    const nextForm = {
      trial_min_completed_jobs: String(settings.trial_min_completed_jobs),
      commission_rate_percent: String(Math.round(Number(settings.commission_rate || 0) * 10000) / 100),
      royalty_rate_percent: String(Math.round(Number(settings.royalty_rate || 0) * 10000) / 100),
      royalty_min_jobs: String(settings.royalty_min_jobs),
      royalty_min_completion_rate: String(settings.royalty_min_completion_rate),
    };

    setWorkerRewardsSettingsForm((prev) => {
      const same =
        prev.trial_min_completed_jobs === nextForm.trial_min_completed_jobs &&
        prev.commission_rate_percent === nextForm.commission_rate_percent &&
        prev.royalty_rate_percent === nextForm.royalty_rate_percent &&
        prev.royalty_min_jobs === nextForm.royalty_min_jobs &&
        prev.royalty_min_completion_rate === nextForm.royalty_min_completion_rate;
      return same ? prev : nextForm;
    });
  };

  const hydrateCommissionForm = (config: AdminCommissionConfig) => {
    const nextOverrides = config.service_overrides.reduce<Record<string, string>>((acc, override) => {
      if (override.is_active) {
        acc[String(override.id_service)] = String(override.rate_percent);
      }
      return acc;
    }, {});

    const urgencyAdjustments = config.urgency_adjustments.reduce<Record<string, string>>((acc, rule) => {
      if (rule.is_active) {
        acc[rule.urgency_level] = String(rule.rate_percent);
      }
      return acc;
    }, {});

    const workerTierAdjustments = config.worker_tier_adjustments.reduce<Record<string, string>>((acc, rule) => {
      if (rule.is_active) {
        acc[rule.worker_tier] = String(rule.rate_percent);
      }
      return acc;
    }, {});

    setCommissionForm({
      global_rate_percent: String(config.global_rate_percent),
      service_overrides: nextOverrides,
      urgency_adjustments: urgencyAdjustments,
      worker_tier_adjustments: workerTierAdjustments,
      promo_codes: config.promo_codes
        .filter((rule) => rule.is_active)
        .map((rule) => ({
          promo_code: String(rule.promo_code || ''),
          rate_percent: String(rule.rate_percent),
        })),
    });
  };

  const normalizeCommissionConfig = (data: any): AdminCommissionConfig => ({
    global_rate_percent: Number(data?.global_rate_percent || 0),
    service_overrides: Array.isArray(data?.service_overrides)
      ? data.service_overrides.map((override: any) => ({
          id_rule: Number(override.id_rule || 0),
          id_service: Number(override.id_service || 0),
          service_name: override.service_name || null,
          rate_percent: Number(override.rate_percent || 0),
          is_active: override.is_active !== false,
          priority: Number(override.priority || 100),
          adjustment_mode:
            override.adjustment_mode === 'add_rate' || override.adjustment_mode === 'subtract_rate'
              ? override.adjustment_mode
              : 'set_rate',
        }))
      : [],
    urgency_adjustments: Array.isArray(data?.urgency_adjustments)
      ? data.urgency_adjustments.map((rule: any) => ({
          id_rule: Number(rule.id_rule || 0),
          urgency_level:
            rule.urgency_level === 'urgent' || rule.urgency_level === 'emergency'
              ? rule.urgency_level
              : 'standard',
          rate_percent: Number(rule.rate_percent || 0),
          is_active: rule.is_active !== false,
          priority: Number(rule.priority || 200),
          adjustment_mode:
            rule.adjustment_mode === 'subtract_rate' || rule.adjustment_mode === 'set_rate'
              ? rule.adjustment_mode
              : 'add_rate',
        }))
      : [],
    worker_tier_adjustments: Array.isArray(data?.worker_tier_adjustments)
      ? data.worker_tier_adjustments.map((rule: any) => ({
          id_rule: Number(rule.id_rule || 0),
          worker_tier:
            rule.worker_tier === 'verified' || rule.worker_tier === 'premium' || rule.worker_tier === 'elite'
              ? rule.worker_tier
              : 'standard',
          rate_percent: Number(rule.rate_percent || 0),
          is_active: rule.is_active !== false,
          priority: Number(rule.priority || 300),
          adjustment_mode:
            rule.adjustment_mode === 'add_rate' || rule.adjustment_mode === 'set_rate'
              ? rule.adjustment_mode
              : 'subtract_rate',
        }))
      : [],
    promo_codes: Array.isArray(data?.promo_codes)
      ? data.promo_codes.map((rule: any) => ({
          id_rule: Number(rule.id_rule || 0),
          promo_code: String(rule.promo_code || ''),
          rate_percent: Number(rule.rate_percent || 0),
          is_active: rule.is_active !== false,
          priority: Number(rule.priority || 400),
          adjustment_mode:
            rule.adjustment_mode === 'add_rate' || rule.adjustment_mode === 'set_rate'
              ? rule.adjustment_mode
              : 'subtract_rate',
        }))
      : [],
    summary: {
      effective_default_rate_percent: Number(
        data?.summary?.effective_default_rate_percent ?? data?.global_rate_percent ?? 0
      ),
      service_override_count: Number(data?.summary?.service_override_count || 0),
      urgency_rule_count: Number(data?.summary?.urgency_rule_count || 0),
      worker_tier_rule_count: Number(data?.summary?.worker_tier_rule_count || 0),
      promo_rule_count: Number(data?.summary?.promo_rule_count || 0),
    },
  });

  const fetchCommissionRulesAdmin = async () => {
    setCommissionLoading(true);
    try {
      const res = await fetch(API_ENDPOINTS.admin.commissionRules, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        notyf.error(data?.error || 'Could not load commission rules.');
        return;
      }

      const nextConfig = normalizeCommissionConfig(data);
      setCommissionConfig(nextConfig);
      hydrateCommissionForm(nextConfig);
    } catch {
      notyf.error('Connection error loading commission rules.');
    } finally {
      setCommissionLoading(false);
    }
  };

  const handleSaveCommissionConfig = async () => {
    const defaultRate = Number(commissionForm.global_rate_percent);
    if (!Number.isFinite(defaultRate) || defaultRate < 0 || defaultRate > 50) {
      notyf.error('Default commission must be between 0% and 50%.');
      return;
    }

    const serviceOverrides = Object.entries(commissionForm.service_overrides)
      .map(([idService, rate]) => ({
        id_service: Number(idService),
        rate_percent: Number(rate),
      }))
      .filter(
        (override) =>
          Number.isFinite(override.id_service) &&
          Number.isFinite(override.rate_percent) &&
          override.rate_percent >= 0 &&
          override.rate_percent <= 50
      );

    const urgencyAdjustments = Object.entries(commissionForm.urgency_adjustments)
      .map(([urgency_level, rate_percent]) => ({
        urgency_level,
        rate_percent: Number(rate_percent),
      }))
      .filter(
        (rule) =>
          ['standard', 'urgent', 'emergency'].includes(rule.urgency_level) &&
          Number.isFinite(rule.rate_percent) &&
          rule.rate_percent >= 0 &&
          rule.rate_percent <= 50
      );

    const workerTierAdjustments = Object.entries(commissionForm.worker_tier_adjustments)
      .map(([worker_tier, rate_percent]) => ({
        worker_tier,
        rate_percent: Number(rate_percent),
      }))
      .filter(
        (rule) =>
          ['standard', 'verified', 'premium', 'elite'].includes(rule.worker_tier) &&
          Number.isFinite(rule.rate_percent) &&
          rule.rate_percent >= 0 &&
          rule.rate_percent <= 50
      );

    const promoCodes = commissionForm.promo_codes
      .map((rule) => ({
        promo_code: String(rule.promo_code || '').trim().toUpperCase().replace(/\s+/g, ''),
        rate_percent: Number(rule.rate_percent),
      }))
      .filter(
        (rule) =>
          rule.promo_code.length > 0 &&
          Number.isFinite(rule.rate_percent) &&
          rule.rate_percent >= 0 &&
          rule.rate_percent <= 50
      );

    setSavingCommissionConfig(true);
    try {
      const res = await fetch(API_ENDPOINTS.admin.commissionRules, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          global_rate_percent: defaultRate,
          service_overrides: serviceOverrides,
          urgency_adjustments: urgencyAdjustments,
          worker_tier_adjustments: workerTierAdjustments,
          promo_codes: promoCodes,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        notyf.error(data?.error || 'Could not update commission rules.');
        return;
      }

      const nextConfig = normalizeCommissionConfig(data);
      setCommissionConfig(nextConfig);
      hydrateCommissionForm(nextConfig);
      notyf.success('Commission engine updated.');
    } catch {
      notyf.error('Connection error updating commission rules.');
    } finally {
      setSavingCommissionConfig(false);
    }
  };

  const fetchWorkerPayoutsAdmin = async (status: 'all' | 'scheduled' | 'paid' | 'cancelled' = workerRewardsStatus) => {
    setWorkerPayoutsLoading(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin.workerPayouts}?status=${status}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        notyf.error(data?.error || 'Could not load worker payouts.');
        return;
      }

      setWorkerPayoutsSummary(data.summary || null);
      setWorkerPayouts(Array.isArray(data.payouts) ? data.payouts : []);
    } catch {
      notyf.error('Connection error loading worker payouts.');
    } finally {
      setWorkerPayoutsLoading(false);
    }
  };

  const fetchPaymentLedgerAdmin = async () => {
    setPaymentLedgerLoading(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin.paymentLedger}?limit=40`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        notyf.error(data?.error || 'Could not load payment ledger.');
        return;
      }

      setPaymentLedgerEntries(Array.isArray(data.entries) ? data.entries : []);
    } catch {
      notyf.error('Connection error loading payment ledger.');
    } finally {
      setPaymentLedgerLoading(false);
    }
  };

  const fetchFinanceReportAdmin = async (
    from: string = financeReportRange.from,
    to: string = financeReportRange.to
  ) => {
    setFinanceReportLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      const res = await fetch(`${API_ENDPOINTS.admin.financeReport}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        notyf.error(data?.error || 'Could not load finance report.');
        return;
      }

      setFinanceReport(data as AdminFinanceReport);
    } catch {
      notyf.error('Connection error loading finance report.');
    } finally {
      setFinanceReportLoading(false);
    }
  };

  const handleExportFinanceReport = async () => {
    setExportingFinanceReport(true);
    try {
      const params = new URLSearchParams({
        from: financeReportRange.from,
        to: financeReportRange.to,
      });
      const res = await fetch(`${API_ENDPOINTS.admin.exportFinanceReport}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        notyf.error(data?.error || 'Could not export finance report.');
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `fixlife-finance-report-${financeReportRange.from}-to-${financeReportRange.to}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(url);
      notyf.success('Finance report exported.');
    } catch {
      notyf.error('Connection error exporting finance report.');
    } finally {
      setExportingFinanceReport(false);
    }
  };

  const fetchFinanceCases = async () => {
    setFinanceCasesLoading(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin.financeCases}?limit=40`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        notyf.error(data?.error || 'Could not load finance cases.');
        return;
      }
      setFinanceCases(Array.isArray(data.cases) ? data.cases : []);
    } catch {
      notyf.error('Connection error loading finance cases.');
    } finally {
      setFinanceCasesLoading(false);
    }
  };

  const handleCreateFinanceCase = async () => {
    setCreatingFinanceCase(true);
    try {
      const res = await fetch(API_ENDPOINTS.admin.financeCases, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          case_type: financeCaseForm.case_type,
          direction: financeCaseForm.direction,
          id_request: financeCaseForm.id_request ? Number(financeCaseForm.id_request) : undefined,
          id_payment: financeCaseForm.id_payment ? Number(financeCaseForm.id_payment) : undefined,
          amount: Number(financeCaseForm.amount),
          currency_code: financeCaseForm.currency_code || 'USD',
          reason: financeCaseForm.reason,
          notes: financeCaseForm.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        notyf.error(data?.error || 'Could not create finance case.');
        return;
      }
      notyf.success('Finance case created.');
      setFinanceCaseForm({
        case_type: 'refund',
        direction: 'customer_refund',
        id_request: '',
        id_payment: '',
        amount: '',
        currency_code: 'USD',
        reason: '',
        notes: '',
      });
      await fetchFinanceCases();
      await fetchFinanceClosureReport();
    } catch {
      notyf.error('Connection error creating finance case.');
    } finally {
      setCreatingFinanceCase(false);
    }
  };

  const handleResolveFinanceCase = async (idCase: number) => {
    setResolvingFinanceCaseId(idCase);
    try {
      const res = await fetch(API_ENDPOINTS.admin.resolveFinanceCase(idCase), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          apply_ledger: true,
          resolution_notes: 'Resolved from admin dashboard',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        notyf.error(data?.error || 'Could not resolve finance case.');
        return;
      }
      notyf.success('Finance case resolved.');
      await fetchFinanceCases();
      await fetchFinanceClosureReport();
      await fetchPaymentLedgerAdmin();
    } catch {
      notyf.error('Connection error resolving finance case.');
    } finally {
      setResolvingFinanceCaseId(null);
    }
  };

  const fetchFinanceClosureReport = async (
    period: 'weekly' | 'monthly' = financeClosurePeriod,
    from: string = financeReportRange.from,
    to: string = financeReportRange.to
  ) => {
    setFinanceClosureLoading(true);
    try {
      const params = new URLSearchParams({ period, from, to });
      const res = await fetch(`${API_ENDPOINTS.admin.financeClosures}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        notyf.error(data?.error || 'Could not load finance closure report.');
        return;
      }
      setFinanceClosureReport(data as AdminFinanceClosureReport);
    } catch {
      notyf.error('Connection error loading finance closure report.');
    } finally {
      setFinanceClosureLoading(false);
    }
  };

  const fetchSystemEvents = async () => {
    setSystemEventsLoading(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin.systemEvents}?limit=30`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        notyf.error(data?.error || 'Could not load system events.');
        return;
      }
      setSystemEvents(Array.isArray(data.events) ? data.events : []);
    } catch {
      notyf.error('Connection error loading system events.');
    } finally {
      setSystemEventsLoading(false);
    }
  };

  const fetchBackgroundJobs = async () => {
    setBackgroundJobsLoading(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin.backgroundJobs}?limit=30`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        notyf.error(data?.error || 'Could not load background jobs.');
        return;
      }
      setBackgroundJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } catch {
      notyf.error('Connection error loading background jobs.');
    } finally {
      setBackgroundJobsLoading(false);
    }
  };

  const fetchWorkerRewardsAdmin = async (
    status: 'all' | 'scheduled' | 'paid' | 'cancelled' = workerRewardsStatus
  ) => {
    setWorkerRewardsLoading(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin.workerRewards}?status=${status}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        notyf.error(data?.error || 'Could not load worker rewards.');
        return;
      }

      setWorkerRewardsSettings(data.settings);
      hydrateWorkerRewardsSettingsForm(data.settings);
      setWorkerRewardsSummary(data.summary || null);
      setWorkerRewardsPayouts(Array.isArray(data.payouts) ? data.payouts : []);
    } catch {
      notyf.error('Connection error loading worker rewards.');
    } finally {
      setWorkerRewardsLoading(false);
    }
  };

  const handleSaveWorkerRewardsSettings = async () => {
    setSavingWorkerRewardsSettings(true);
    try {
      const res = await fetch(API_ENDPOINTS.admin.workerRewardsSettings, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          trial_min_completed_jobs: Number(workerRewardsSettingsForm.trial_min_completed_jobs),
          commission_rate_percent: Number(workerRewardsSettingsForm.commission_rate_percent),
          royalty_rate_percent: Number(workerRewardsSettingsForm.royalty_rate_percent),
          royalty_min_jobs: Number(workerRewardsSettingsForm.royalty_min_jobs),
          royalty_min_completion_rate: Number(workerRewardsSettingsForm.royalty_min_completion_rate),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        notyf.error(data?.error || 'Could not update rewards program.');
        return;
      }

      notyf.success('Rewards program updated.');
      await fetchWorkerRewardsAdmin(workerRewardsStatus);
    } catch {
      notyf.error('Connection error updating rewards program.');
    } finally {
      setSavingWorkerRewardsSettings(false);
    }
  };

  const handleMarkBonusPaid = async (idBonusPayout: number) => {
    setMarkingPayoutId(idBonusPayout);
    try {
      const res = await fetch(API_ENDPOINTS.admin.markWorkerBonusPaid(idBonusPayout), {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        notyf.error(data?.error || 'Could not mark bonus as paid.');
        return;
      }

      notyf.success('Bonus payout marked as paid.');
      await fetchWorkerRewardsAdmin(workerRewardsStatus);
      await fetchPaymentLedgerAdmin();
    } catch {
      notyf.error('Connection error marking payout as paid.');
    } finally {
      setMarkingPayoutId(null);
    }
  };

  const handleMarkWorkerPayoutPaid = async (idWorkerPayout: number) => {
    setMarkingWorkerPayoutId(idWorkerPayout);
    try {
      const res = await fetch(API_ENDPOINTS.admin.markWorkerPayoutPaid(idWorkerPayout), {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        notyf.error(data?.error || 'Could not mark worker payout as paid.');
        return;
      }

      notyf.success('Worker payout marked as paid.');
      await fetchWorkerPayoutsAdmin(workerRewardsStatus);
      await fetchPaymentLedgerAdmin();
    } catch {
      notyf.error('Connection error marking worker payout as paid.');
    } finally {
      setMarkingWorkerPayoutId(null);
    }
  };

  const handleResendWorkerStatement = async (idUser: number | null) => {
    if (!idUser) {
      notyf.error('Worker user ID is missing for this payout.');
      return;
    }

    setResendingStatementUserId(idUser);
    try {
      const res = await fetch(API_ENDPOINTS.admin.resendWorkerStatement(idUser), {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        notyf.error(data?.error || 'Could not resend statement.');
        return;
      }

      notyf.success('Statement email queued.');
    } catch {
      notyf.error('Connection error resending statement.');
    } finally {
      setResendingStatementUserId(null);
    }
  };

  const fetchAdminActivity = async (
    action: 'all' | string = activityActionFilter,
    entity: 'all' | string = activityEntityFilter
  ) => {
    setAdminActivityLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '200');
      if (action !== 'all') params.set('action', String(action));
      if (entity !== 'all') params.set('entity', String(entity));

      const res = await fetch(`${API_ENDPOINTS.admin.activity}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.activities)) {
        setAdminActivity(data.activities);
      }
    } catch {
      // silent
    } finally {
      setAdminActivityLoading(false);
    }
  };

  return (
    <div
      className={`dashboard-theme dashboard-shell dashboard-theme--admin fixed inset-0 z-[100] flex overflow-hidden font-sans text-gray-900 backdrop-blur-xl ${isDark ? 'dashboard-theme-dark' : 'dashboard-theme-light'} bg-gray-50/90`}
      data-dashboard-theme={theme}
      style={{ colorScheme: theme }}
    >
      
      {/* Decorative Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-5%] w-[40vw] h-[40vw] bg-bird-blue/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[35vw] h-[35vw] bg-bird-yellow/5 rounded-full blur-[120px]" />
        <div className="absolute top-[40%] right-[30%] w-[20vw] h-[20vw] bg-bird-orange/5 rounded-full blur-[90px]" />
      </div>

      {/* Document Preview Modal */}
      <AnimatePresence>
        {previewDoc && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-fade-in-up" style={{ animationDuration: '0.3s' }} onClick={() => setPreviewDoc(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl overflow-hidden relative z-10 w-full max-w-4xl max-h-[90vh] flex flex-col"
            >
              <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-gray-50/80 backdrop-blur-md">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  <FileText size={18} className="text-bird-blue" />
                  {previewDoc.name}
                </h3>
                <div className="flex items-center gap-2">
                  <a 
                    href={previewDoc.url} 
                    download 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-gradient-to-r from-bird-blue to-bird-darkBlue text-white text-sm font-bold rounded-xl shadow-lg shadow-bird-blue/20 hover:scale-[1.02] transition-all flex items-center gap-2"
                  >
                    <Download size={16} /> Download
                  </a>
                  <button onClick={() => setPreviewDoc(null)} className="p-2 text-gray-500 hover:bg-red-50 hover:text-red-500 rounded-xl transition-colors">
                    <X size={20} />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto bg-gray-100/50 flex items-center justify-center p-4 min-h-[500px]">
                {previewDoc.url.toLowerCase().endsWith('.pdf') ? (
                  <iframe src={previewDoc.url} className="w-full h-full rounded-2xl shadow-sm border border-gray-200 bg-white" title={previewDoc.name} />
                ) : (
                  <img src={previewDoc.url} alt={previewDoc.name} className="max-w-full max-h-full object-contain rounded-2xl shadow-sm bg-white" />
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sidebar Overlay - Mobile */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={{ x: -280, width: 280 }}
        animate={{ x: isSidebarOpen ? 0 : -280, width: isSidebarCollapsed ? 88 : 280 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed lg:relative z-50 h-full bg-white/80 backdrop-blur-2xl border-r border-gray-200/50 shadow-2xl lg:shadow-[4px_0_24px_rgba(0,0,0,0.02)] flex flex-col"
      >
        <div className={`h-24 flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between px-6'} border-b border-gray-100/50 transition-all duration-300`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-bird-blue to-bird-darkBlue flex shrink-0 items-center justify-center shadow-lg shadow-bird-blue/30 relative overflow-hidden group">
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
              <span className="text-white font-black text-xl relative z-10">F</span>
            </div>
            {(!isSidebarCollapsed || (typeof window !== 'undefined' && window.innerWidth < 1024)) && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col overflow-hidden whitespace-nowrap">
                <span className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-700 block leading-none">Fixlife</span>
                <span className="text-[10px] font-bold text-bird-blue tracking-widest uppercase">Admin Panel</span>
              </motion.div>
            )}
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2.5 rounded-xl bg-gray-50 text-gray-500 hover:bg-gray-100 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Collapse Toggle */}
        <button 
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="hidden lg:flex absolute -right-3 top-8 w-6 h-6 bg-white border border-gray-200 rounded-full items-center justify-center text-gray-500 hover:text-bird-blue hover:border-bird-blue shadow-sm z-50 transition-all"
        >
          {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <nav className={`flex-1 ${isSidebarCollapsed ? 'px-3' : 'px-4'} py-8 space-y-2 overflow-y-auto custom-scrollbar`}>
          {navItems.map((item) => {
            const isActive = activeTab === item.name;
            return (
              <div key={item.name} className="relative group/nav">
                <button
                  onClick={() => setActiveTab(item.name)}
                  className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start gap-3 px-4'} py-3.5 rounded-2xl transition-all duration-300 group relative overflow-hidden
                    ${isActive 
                      ? 'text-bird-darkBlue font-bold shadow-sm border border-bird-blue/10 bg-white' 
                      : 'text-gray-500 hover:bg-white hover:text-gray-900 hover:shadow-sm font-medium border border-transparent'}`}
                >
                  {isActive && (
                    <motion.div layoutId="activeNavBg" className="absolute inset-0 bg-gradient-to-r from-bird-blue/10 to-transparent" />
                  )}
                  <item.icon size={20} className={`relative z-10 shrink-0 ${isActive ? 'text-bird-blue' : 'text-gray-400 group-hover:text-bird-blue transition-colors'}`} />
                  {!isSidebarCollapsed && <span className="relative z-10 whitespace-nowrap">{item.name}</span>}
                  {isActive && (
                    <motion.div layoutId="activeNavIndicator" className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-bird-blue rounded-r-full" />
                  )}
                </button>
                {isSidebarCollapsed && (
                  <div className="absolute left-full top-1/2 -translate-y-1/2 ml-4 px-3 py-2 bg-gray-900 text-white text-xs font-bold rounded-lg opacity-0 invisible group-hover/nav:opacity-100 group-hover/nav:visible transition-all whitespace-nowrap shadow-xl z-50">
                    {item.name}
                    <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-gray-900 rotate-45" />
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* User Profile */}
        <div className={`p-4 border-t border-gray-100/50 pb-6`}>
          {!isSidebarCollapsed ? (
            <div className="bg-gray-50 rounded-2xl p-4 mb-4 flex items-center gap-3 border border-gray-100">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-bird-orange via-bird-yellow to-bird-blue p-[2px] shrink-0">
                <div className="w-full h-full rounded-full border-2 border-white overflow-hidden bg-white flex items-center justify-center">
                  <span className="text-gray-800 font-black text-sm">
                    {(user?.name || 'A').charAt(0)}
                    {(user?.lastname || 'D').charAt(0)}
                  </span>
                </div>
              </div>
              <div className="overflow-hidden">
                <p className="font-bold text-gray-900 text-sm whitespace-nowrap truncate">{user?.name || 'System'} {user?.lastname || 'Admin'}</p>
                <p className="text-gray-500 text-xs truncate">Super Admin</p>
              </div>
            </div>
          ) : (
            <div className="w-10 h-10 mx-auto rounded-full bg-gradient-to-tr from-bird-orange via-bird-yellow to-bird-blue p-[2px] mb-4 shrink-0 cursor-pointer">
              <div className="w-full h-full rounded-full border-2 border-white overflow-hidden bg-white flex items-center justify-center">
                <span className="text-gray-800 font-black text-sm">
                  {(user?.name || 'A').charAt(0)}
                  {(user?.lastname || 'D').charAt(0)}
                </span>
              </div>
            </div>
          )}
          <button onClick={handleLogout} className={`w-full flex items-center justify-center ${isSidebarCollapsed ? 'p-3' : 'gap-2 px-4 py-3.5'} rounded-xl border border-gray-200 text-gray-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all font-bold shadow-sm group`}>
            <LogOut size={18} className="shrink-0 group-hover:-translate-x-1 transition-transform" />
            {!isSidebarCollapsed && <span className="whitespace-nowrap">Close Dashboard</span>}
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full relative z-10">
        {/* Top Header */}
        <header className="h-24 bg-white/40 backdrop-blur-xl border-b border-gray-200/50 flex items-center justify-between px-6 md:px-10 z-20 sticky top-0 shadow-[0_4px_30px_rgba(0,0,0,0.01)]">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2.5 rounded-xl bg-white border border-gray-200 text-gray-600 hover:text-bird-blue hover:border-bird-blue/50 transition-colors shadow-sm"
            >
              <Menu size={20} />
            </button>
            <div className="flex flex-col">
              <h1 className="text-lg md:text-2xl font-black text-gray-900 tracking-tight leading-none group-hover:translate-x-1 transition-transform">{activeTab}</h1>
              <p className="text-[10px] md:text-sm text-gray-500 hidden xs:block font-medium mt-0.5">Admin Overview</p>
            </div>
          </div>

          <div className="flex items-center gap-3 md:gap-4">
            <DashboardThemeToggle
              theme={theme}
              onToggle={toggleTheme}
              className="min-w-0 bg-white/90 text-slate-700 shadow-[0_16px_30px_rgba(15,23,42,0.08)]"
            />
            <div className="relative hidden md:block group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-bird-blue transition-colors" size={18} />
              <input 
                type="text" 
                placeholder="Search users, pros, or transactions..." 
                className="w-80 pl-11 pr-4 py-2.5 bg-white/80 border border-gray-200 rounded-full text-sm outline-none focus:border-bird-blue focus:ring-4 focus:ring-bird-blue/10 transition-all shadow-sm backdrop-blur-md"
              />
            </div>
            <div className="relative" ref={notificationsRef}>
              <button
                onClick={() => {
                  const nextOpen = !isNotificationsOpen;
                  setIsNotificationsOpen(nextOpen);
                  if (nextOpen) fetchPendingWorkers();
                }}
                className="relative p-2.5 rounded-full bg-white border border-gray-200 text-gray-500 hover:text-bird-blue hover:border-bird-blue/30 hover:shadow-md transition-all"
                aria-label="Worker notifications"
              >
                <Bell size={20} />
                {pendingWorkers.length > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 rounded-full border-[2.5px] border-white text-white text-[10px] font-bold flex items-center justify-center">
                    {pendingWorkers.length}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {isNotificationsOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-3 w-[320px] sm:w-[360px] bg-white border border-gray-200 shadow-2xl rounded-2xl overflow-hidden z-50"
                  >
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-black text-gray-900">Worker Requests</p>
                        <p className="text-xs text-gray-500">Pending approvals</p>
                      </div>
                      <span className="text-[11px] font-bold text-gray-500">{pendingWorkers.length}</span>
                    </div>

                    <div className="max-h-[320px] overflow-y-auto">
                      {workersLoading ? (
                        <div className="p-4 text-sm text-gray-500">Loading notifications...</div>
                      ) : pendingWorkers.length === 0 ? (
                        <div className="p-4 text-sm text-gray-500">No pending requests right now.</div>
                      ) : (
                        pendingWorkers.slice(0, 5).map((worker) => (
                          <button
                            key={worker.id_user}
                            onClick={() => {
                              setActiveTab('Users & Pros');
                              setIsNotificationsOpen(false);
                            }}
                            className="w-full text-left px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-xl bg-bird-blue/10 text-bird-blue flex items-center justify-center font-black text-sm shrink-0">
                                {worker.name.charAt(0)}{worker.lastname.charAt(0)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-gray-900 truncate">{worker.name} {worker.lastname}</p>
                                <p className="text-xs text-gray-500 truncate">{worker.email}</p>
                                <p className="text-[11px] text-gray-400 mt-0.5">
                                  {new Date(worker.created_at).toLocaleDateString()}
                                </p>
                                {worker.services?.length > 0 && (
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {worker.services.slice(0, 2).map((s) => (
                                      <span key={s.id_service} className="px-2 py-0.5 rounded-full bg-bird-blue/10 text-bird-blue text-[10px] font-bold">
                                        {s.name}
                                      </span>
                                    ))}
                                    {worker.services.length > 2 && (
                                      <span className="text-[10px] text-gray-400 font-bold">+{worker.services.length - 2}</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>

                    <div className="p-3 border-t border-gray-100">
                      <button
                        onClick={() => {
                          setActiveTab('Users & Pros');
                          setIsNotificationsOpen(false);
                        }}
                        className="w-full text-xs font-bold px-3 py-2 rounded-xl border border-gray-200 text-gray-600 hover:text-bird-blue hover:border-bird-blue/40 hover:bg-bird-blue/5 transition-all"
                      >
                        Review All Requests
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="flex items-center gap-3 pl-4 md:pl-6 border-l border-gray-200">
              <div className="hidden md:block text-right">
                <p className="font-bold text-gray-900 text-sm">{user?.name || 'System'} {user?.lastname || 'Admin'}</p>
                <p className="text-bird-blue text-xs font-bold">Super User</p>
              </div>
              <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-bird-orange via-bird-yellow to-bird-blue p-[2px] shadow-md cursor-pointer hover:scale-105 transition-transform">
                <div className="w-full h-full rounded-full border-2 border-white overflow-hidden bg-white flex items-center justify-center">
                  <span className="text-gray-800 font-black text-sm">
                    {(user?.name || 'A').charAt(0)}
                    {(user?.lastname || 'D').charAt(0)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
          <div className="max-w-[1600px] mx-auto pb-10">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                {renderTabContent()}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
};


