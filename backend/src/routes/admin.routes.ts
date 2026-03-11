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
  getDashboardStats,
  getRequestsHistory,
  getHeroSlidesPublic,
  updateHeroSlides,
  uploadHeroImageAsset,
  uploadHeroSlideImage,
} from '../controllers/admin.controller';
import { verifyToken, requireAdmin } from '../middlewares/auth.middleware';
import { sensitiveLimiter } from '../middlewares/security.middleware';
import { upload } from '../middlewares/upload.middleware';

const router = Router();

// All admin routes require token + admin role (except public hero slides)
router.get('/hero-slides', getHeroSlidesPublic);

router.use(verifyToken, requireAdmin);

// Services CRUD
router.post('/services', sensitiveLimiter, createService);
router.get('/services', getAllServices);
router.put('/services/:id', sensitiveLimiter, updateService);
router.delete('/services/:id', sensitiveLimiter, deleteService);
router.get('/service-cards', getServiceCardsAdmin);
router.post('/service-cards', sensitiveLimiter, createServiceCard);
router.put('/service-cards/:idCard', sensitiveLimiter, updateServiceCard);
router.delete('/service-cards/:idCard', sensitiveLimiter, deleteServiceCard);

// Worker approval
router.get('/pending-workers', getPendingWorkers);
router.put('/workers/:id/approve', sensitiveLimiter, approveWorker);
router.put('/workers/:id/reject', sensitiveLimiter, rejectWorker);

// Dashboard Stats
router.get('/stats', getDashboardStats);
router.get('/requests-history', getRequestsHistory);

// Hero Slides Editor
router.put('/hero-slides', sensitiveLimiter, updateHeroSlides);
router.post(
  '/hero-slides/image-upload',
  sensitiveLimiter,
  upload.single('image'),
  uploadHeroImageAsset
);
router.post(
  '/hero-slides/:idSlide/image',
  sensitiveLimiter,
  upload.single('image'),
  uploadHeroSlideImage
);

export default router;
