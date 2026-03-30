import { Router } from 'express';
import {
  acceptWorkerRequest,
  counterOfferWorkerRequest,
  changeWorkerPassword,
  deletePortfolioImage,
  getWorkerMe,
  getWorkerRequests,
  rejectWorkerRequest,
  requestWorkerEmailChangeToken,
  updateWorkerSettings,
  uploadDocuments,
  uploadPortfolioImages,
  uploadProfileImage,
  updateWorkerPresence,
  verifyWorkerEmailChangeToken,
} from '../controllers/worker.controller';
import { verifyToken } from '../middlewares/auth.middleware';
import { sensitiveLimiter } from '../middlewares/security.middleware';
import { upload } from '../middlewares/upload.middleware';
import { validate } from '../middlewares/validate.middleware';
import { WorkerSchema } from '../schemas/worker.schema';

const router = Router();

router.get('/me', verifyToken, getWorkerMe);
router.get('/requests', verifyToken, getWorkerRequests);
router.post('/requests/:idRequest/accept', verifyToken, sensitiveLimiter, acceptWorkerRequest);
router.post('/requests/:idRequest/reject', verifyToken, sensitiveLimiter, rejectWorkerRequest);
router.post('/requests/:idRequest/counter-offer', verifyToken, sensitiveLimiter, counterOfferWorkerRequest);
router.put('/presence', verifyToken, updateWorkerPresence);
router.put('/settings', verifyToken, sensitiveLimiter, validate(WorkerSchema.settings), updateWorkerSettings);
router.put('/change-password', verifyToken, sensitiveLimiter, validate(WorkerSchema.changePassword), changeWorkerPassword);
router.post('/email-change/request', verifyToken, sensitiveLimiter, validate(WorkerSchema.emailChangeRequest), requestWorkerEmailChangeToken);
router.post('/email-change/verify', verifyToken, sensitiveLimiter, validate(WorkerSchema.tokenOnly), verifyWorkerEmailChangeToken);
router.post('/profile-image', verifyToken, sensitiveLimiter, upload.single('profile_image'), uploadProfileImage);
router.post('/portfolio', verifyToken, sensitiveLimiter, upload.array('portfolio_images', 10), uploadPortfolioImages);
router.delete('/portfolio/:idPhoto', verifyToken, sensitiveLimiter, deletePortfolioImage);

router.post(
  '/verify', 
  verifyToken, 
  upload.fields([
    { name: 'dui_document', maxCount: 1 }, 
    { name: 'cert_document', maxCount: 1 }
  ]), 
  uploadDocuments
);

export default router;
