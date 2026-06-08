import { Router } from 'express';
import {
  approveWorker,
  getPendingWorkers,
  getUsersAdmin,
  getUserDetailAdmin,
  getWorkerTierBenefitsAdmin,
  getWorkerTierHistoryAdmin,
  rejectWorker,
  resendWorkerStatementAdminController,
  updateUserRole,
  updateUserStatus,
  updateWorkerTierAdmin,
  updateWorkerTierBenefitsAdmin,
} from '../../controllers/admin.controller';
import { sensitiveLimiter } from '../../middlewares/security.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { AdminSchema } from '../../schemas/admin.schema';

const router = Router();

router.get('/users', getUsersAdmin);
router.get('/users/:id', getUserDetailAdmin);
router.put('/users/:id/role', sensitiveLimiter, validate(AdminSchema.userRole), updateUserRole);
router.put('/users/:id/status', sensitiveLimiter, validate(AdminSchema.userStatus), updateUserStatus);

router.get('/pending-workers', getPendingWorkers);
router.put('/workers/:id/approve', sensitiveLimiter, validate(AdminSchema.workerDecision), approveWorker);
router.put('/workers/:id/reject', sensitiveLimiter, validate(AdminSchema.workerDecision), rejectWorker);
router.put('/workers/:id/tier', sensitiveLimiter, validate(AdminSchema.workerTierUpdate), updateWorkerTierAdmin);
router.post('/workers/:idUser/statement/resend', sensitiveLimiter, validate(AdminSchema.emptyBody), resendWorkerStatementAdminController);

router.get('/worker-tier-benefits', getWorkerTierBenefitsAdmin);
router.put('/worker-tier-benefits', sensitiveLimiter, validate(AdminSchema.workerTierBenefits), updateWorkerTierBenefitsAdmin);
router.get('/worker-tier-history', getWorkerTierHistoryAdmin);

export default router;
