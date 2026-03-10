import { Router } from 'express';
import {
  changeWorkerPassword,
  deletePortfolioImage,
  getWorkerMe,
  requestWorkerEmailChangeToken,
  updateWorkerSettings,
  uploadDocuments,
  uploadPortfolioImages,
  uploadProfileImage,
  verifyWorkerEmailChangeToken,
} from '../controllers/worker.controller';
import { verifyToken } from '../middlewares/auth.middleware';
import { sensitiveLimiter } from '../middlewares/security.middleware';
import { upload } from '../middlewares/upload.middleware';
import {
  validateChangePassword,
  validateEmailChangeRequest,
  validateTokenOnly,
  validateWorkerSettings,
} from '../middlewares/validation.middleware';

const router = Router();

router.get('/me', verifyToken, getWorkerMe);
router.put('/settings', verifyToken, sensitiveLimiter, validateWorkerSettings, updateWorkerSettings);
router.put('/change-password', verifyToken, sensitiveLimiter, validateChangePassword, changeWorkerPassword);
router.post('/email-change/request', verifyToken, sensitiveLimiter, validateEmailChangeRequest, requestWorkerEmailChangeToken);
router.post('/email-change/verify', verifyToken, sensitiveLimiter, validateTokenOnly, verifyWorkerEmailChangeToken);
router.post('/profile-image', verifyToken, sensitiveLimiter, upload.single('profile_image'), uploadProfileImage);
router.post('/portfolio', verifyToken, sensitiveLimiter, upload.array('portfolio_images', 10), uploadPortfolioImages);
router.delete('/portfolio/:idPhoto', verifyToken, sensitiveLimiter, deletePortfolioImage);

router.post(
  '/verify', 
  verifyToken, 
  upload.fields([
    { name: 'dui_document', maxCount: 1 }, 
    { name: 'cert_document', maxCount: 1 },
    { name: 'selfie_image', maxCount: 1 }
  ]), 
  uploadDocuments
);

export default router;
