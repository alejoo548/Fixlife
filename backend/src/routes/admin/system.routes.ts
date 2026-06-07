import { Router } from 'express';
import {
  exportDashboardStatsPdfAdmin,
  getAdminActivity,
  getBackgroundJobsAdminController,
  getDashboardStats,
  getSystemEventsAdmin,
  searchAdmin,
} from '../../controllers/admin.controller';
import { sensitiveLimiter } from '../../middlewares/security.middleware';

const router = Router();

router.get('/stats', getDashboardStats);
router.get('/stats/export-pdf', sensitiveLimiter, exportDashboardStatsPdfAdmin);
router.get('/activity', getAdminActivity);
router.get('/system-events', getSystemEventsAdmin);
router.get('/background-jobs', getBackgroundJobsAdminController);
router.get('/search', searchAdmin);

export default router;
