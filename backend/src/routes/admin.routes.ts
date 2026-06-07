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
  getPendingWorkers,
  approveWorker,
  rejectWorker,
  getUsersAdmin,
  updateUserRole,
  updateUserStatus,
  getDashboardStats,
  exportDashboardStatsPdfAdmin,
  getRequestsHistory,
  getAdminActivity,
  getHeroSlidesPublic,
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
} from '../controllers/admin.controller';
import { verifyToken, requireAdmin } from '../middlewares/auth.middleware';
import { sensitiveLimiter } from '../middlewares/security.middleware';
import { uploadImageOnly, validateUploadedFiles } from '../middlewares/upload.middleware';
import { validate } from '../middlewares/validate.middleware';
import { AdminSchema } from '../schemas/admin.schema';

const router = Router();

// All admin routes require token + admin role (except public hero slides)
router.get('/hero-slides', getHeroSlidesPublic);

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
router.put('/users/:id/role', sensitiveLimiter, updateUserRole);
router.put('/users/:id/status', sensitiveLimiter, updateUserStatus);

// Dashboard Stats
router.get('/stats', getDashboardStats);
router.get('/stats/export-pdf', exportDashboardStatsPdfAdmin);
router.get('/requests-history', getRequestsHistory);
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

// Hero Slides Editor
router.put('/hero-slides', sensitiveLimiter, validate(AdminSchema.heroSlides), updateHeroSlides);
router.post(
  '/hero-slides/image-upload',
  sensitiveLimiter,
  uploadImageOnly.single('image'),
  validateUploadedFiles,
  uploadHeroImageAsset
);
router.post(
  '/hero-slides/:idSlide/image',
  sensitiveLimiter,
  uploadImageOnly.single('image'),
  validateUploadedFiles,
  uploadHeroSlideImage
);

export default router;
