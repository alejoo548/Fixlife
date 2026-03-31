import { Router } from 'express';
import {
  acceptWorkerRequest,
  completeWorkerRequest,
  counterOfferWorkerRequest,
  changeWorkerPassword,
  deletePortfolioImage,
  getWorkerMe,
  getWorkerRewardsDashboard,
  getWorkerRequests,
  rejectWorkerRequest,
  requestWorkerEmailChangeToken,
  startWorkerRequest,
  updateWorkerSettings,
  uploadDocuments,
  uploadPortfolioImages,
  uploadProfileImage,
  updateWorkerPresence,
  verifyWorkerEmailChangeToken,
} from '../controllers/worker.controller';
import { requireWorker, verifyToken } from '../middlewares/auth.middleware';
import { sensitiveLimiter } from '../middlewares/security.middleware';
import { upload } from '../middlewares/upload.middleware';
import { validate } from '../middlewares/validate.middleware';
import { WorkerSchema } from '../schemas/worker.schema';

const router = Router();

router.use(verifyToken, requireWorker);

router.get('/me', getWorkerMe);
router.get('/rewards-dashboard', getWorkerRewardsDashboard);
router.get('/requests', getWorkerRequests);
router.post('/requests/:idRequest/accept', sensitiveLimiter, acceptWorkerRequest);
router.post('/requests/:idRequest/reject', sensitiveLimiter, rejectWorkerRequest);
router.post('/requests/:idRequest/counter-offer', sensitiveLimiter, counterOfferWorkerRequest);
router.post('/requests/:idRequest/start', sensitiveLimiter, startWorkerRequest);
router.post('/requests/:idRequest/complete', sensitiveLimiter, completeWorkerRequest);
router.put('/presence', updateWorkerPresence);
router.put('/settings', sensitiveLimiter, validate(WorkerSchema.settings), updateWorkerSettings);
router.put('/change-password', sensitiveLimiter, validate(WorkerSchema.changePassword), changeWorkerPassword);
router.post('/email-change/request', sensitiveLimiter, validate(WorkerSchema.emailChangeRequest), requestWorkerEmailChangeToken);
router.post('/email-change/verify', sensitiveLimiter, validate(WorkerSchema.tokenOnly), verifyWorkerEmailChangeToken);
router.post('/profile-image', sensitiveLimiter, upload.single('profile_image'), uploadProfileImage);
router.post('/portfolio', sensitiveLimiter, upload.array('portfolio_images', 10), uploadPortfolioImages);
router.delete('/portfolio/:idPhoto', sensitiveLimiter, deletePortfolioImage);

router.post(
  '/verify', 
  upload.fields([
    { name: 'dui_document', maxCount: 1 }, 
    { name: 'cert_document', maxCount: 1 }
  ]), 
  uploadDocuments
);

export default router;
