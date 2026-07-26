import { Router } from 'express';
import {
  createService,
  getAllServices,
  updateService,
  deleteService,
  getServiceCardsAdmin,
  createServiceCard,
  updateServiceCard,
  deleteServiceCard,
  getPublicFaqItems,
  getFaqItemsAdmin,
  createFaqItemAdmin,
  updateFaqItemAdmin,
  deleteFaqItemAdmin,
  getPendingWorkers,
  approveWorker,
  rejectWorker,
  getUsersAdmin,
  getUserDetailAdmin,
  updateUserRole,
  updateUserStatus,
  getDashboardStats,
  exportDashboardStatsPdfAdmin,
  getRequestsHistory,
  getRequestDetailAdmin,
  getAdminActivity,
  updateRequestAdmin,
  getHeroSlidesPublic,
  getHeroTextPublic,
  updateHeroText,
  getCommissionRulesAdmin,
  getFinanceSettlementReportAdmin,
  getPaymentLedgerAdmin,
  getWorkerPayoutsAdmin,
  getWorkerRewardsAdminOverview,
  exportFinanceSettlementReportCsvAdmin,
  getBackgroundJobsAdminController,
  markWorkerPayoutPaidController,
  markWorkerBonusPayoutPaidController,
  resendWorkerStatementAdminController,
  getFinanceCasesAdmin,
  getFinanceClosureReportAdmin,
  updateCommissionRulesAdmin,
  createFinanceCaseAdmin,
  resolveFinanceCaseAdmin,
  getSystemEventsAdmin,
  getWorkerTierBenefitsAdmin,
  getWorkerTierHistoryAdmin,
  updateWorkerRewardsProgram,
  updateWorkerTierAdmin,
  updateWorkerTierBenefitsAdmin,
  updateHeroSlides,
  uploadHeroImageAsset,
  uploadHeroSlideImage,
  searchAdmin,
} from '../controllers/admin.controller';
import { verifyToken, requireAdmin } from '../middlewares/auth.middleware';
import { sensitiveLimiter } from '../middlewares/security.middleware';
import { uploadImageOnly, validateUploadedFiles, sanitizeImages } from '../middlewares/upload.middleware';
import { validate } from '../middlewares/validate.middleware';
import { AdminSchema } from '../schemas/admin.schema';

const router = Router();

// All admin routes require token + admin role (except public hero slides)
router.get('/hero-slides', getHeroSlidesPublic);
router.get('/faq-items/public', getPublicFaqItems);
router.get('/hero-text/public', getHeroTextPublic);

router.use(verifyToken, requireAdmin);

// Services CRUD
router.post('/services', sensitiveLimiter, validate(AdminSchema.createService), createService);
router.get('/services', getAllServices);
router.put('/services/:id', sensitiveLimiter, validate(AdminSchema.updateService), updateService);
router.delete('/services/:id', sensitiveLimiter, deleteService);
router.get('/service-cards', getServiceCardsAdmin);
router.post('/service-cards', sensitiveLimiter, validate(AdminSchema.createServiceCard), createServiceCard);
router.put('/service-cards/:idCard', sensitiveLimiter, validate(AdminSchema.updateServiceCard), updateServiceCard);
router.delete('/service-cards/:idCard', sensitiveLimiter, deleteServiceCard);
router.get('/faq-items', getFaqItemsAdmin);
router.post('/faq-items', sensitiveLimiter, validate(AdminSchema.createFaqItem), createFaqItemAdmin);
router.put('/faq-items/:idFaq', sensitiveLimiter, validate(AdminSchema.updateFaqItem), updateFaqItemAdmin);
router.delete('/faq-items/:idFaq', sensitiveLimiter, deleteFaqItemAdmin);

// Worker approval
router.get('/pending-workers', getPendingWorkers);
router.put('/workers/:id/approve', sensitiveLimiter, approveWorker);
router.put('/workers/:id/reject', sensitiveLimiter, rejectWorker);
router.put('/workers/:id/tier', sensitiveLimiter, validate(AdminSchema.workerTierUpdate), updateWorkerTierAdmin);
router.get('/worker-tier-benefits', getWorkerTierBenefitsAdmin);
router.put('/worker-tier-benefits', sensitiveLimiter, validate(AdminSchema.workerTierBenefits), updateWorkerTierBenefitsAdmin);
router.get('/worker-tier-history', getWorkerTierHistoryAdmin);

// Users management
router.get('/users', getUsersAdmin);
router.get('/users/:id', getUserDetailAdmin);
router.put('/users/:id/role', sensitiveLimiter, updateUserRole);
router.put('/users/:id/status', sensitiveLimiter, updateUserStatus);

// Dashboard Stats
router.get('/stats', getDashboardStats);
router.get('/stats/export-pdf', exportDashboardStatsPdfAdmin);
router.get('/requests-history', getRequestsHistory);
router.get('/requests/:idRequest', getRequestDetailAdmin);
router.post('/requests/:idRequest/actions', sensitiveLimiter, validate(AdminSchema.requestAction), updateRequestAdmin);
router.get('/commission-rules', getCommissionRulesAdmin);
router.put('/commission-rules', sensitiveLimiter, validate(AdminSchema.commissionRules), updateCommissionRulesAdmin);
router.get('/worker-rewards', getWorkerRewardsAdminOverview);
router.put('/worker-rewards/settings', sensitiveLimiter, updateWorkerRewardsProgram);
router.post('/worker-rewards/payouts/:idBonusPayout/pay', sensitiveLimiter, markWorkerBonusPayoutPaidController);
router.get('/worker-payouts', getWorkerPayoutsAdmin);
router.post('/worker-payouts/:idWorkerPayout/pay', sensitiveLimiter, markWorkerPayoutPaidController);
router.post('/workers/:idUser/statement/resend', sensitiveLimiter, resendWorkerStatementAdminController);
router.get('/payment-ledger', getPaymentLedgerAdmin);
router.get('/finance-report', getFinanceSettlementReportAdmin);
router.get('/finance-report/export', exportFinanceSettlementReportCsvAdmin);
router.get('/finance-cases', getFinanceCasesAdmin);
router.post('/finance-cases', sensitiveLimiter, validate(AdminSchema.financeCaseCreate), createFinanceCaseAdmin);
router.post('/finance-cases/:idCase/resolve', sensitiveLimiter, validate(AdminSchema.financeCaseResolve), resolveFinanceCaseAdmin);
router.get('/finance-closures', getFinanceClosureReportAdmin);
router.get('/system-events', getSystemEventsAdmin);
router.get('/background-jobs', getBackgroundJobsAdminController);
router.get('/activity', getAdminActivity);
router.get('/search', searchAdmin);

// Hero Slides Editor
router.put('/hero-slides', sensitiveLimiter, validate(AdminSchema.heroSlides), updateHeroSlides);

// Hero Text Editor
router.put('/hero-text', sensitiveLimiter, updateHeroText);
router.post(
  '/hero-slides/image-upload',
  sensitiveLimiter,
  uploadImageOnly.single('image'),
  validateUploadedFiles,
  sanitizeImages,
  uploadHeroImageAsset
);
router.post(
  '/hero-slides/:idSlide/image',
  sensitiveLimiter,
  uploadImageOnly.single('image'),
  validateUploadedFiles,
  sanitizeImages,
  uploadHeroSlideImage
);

export default router;
