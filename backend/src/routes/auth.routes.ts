import { Router } from 'express';
import {
  registerWorker,
  registerUser,
  login,
  verifyWorkerEmail,
  resendOtp,
  forgotPassword,
  resetPassword,
  verifyResetToken,
  uploadProfileImage,
  removeProfileImage,
  updateProfile
} from '../controllers/auth.controller';
import { authLimiter } from '../middlewares/security.middleware';
import {
  validateEmailAndPassword,
  validateEmailOnly,
  validateOtpPayload,
  validateRegisterWorker,
  validateRegisterUser,
  validateResetPassword,
  validateVerifyResetToken,
} from '../middlewares/validation.middleware';
import { verifyToken } from '../middlewares/auth.middleware';
import { uploadImageOnly } from '../middlewares/upload.middleware';

const router = Router();

router.post('/register/worker', authLimiter, validateRegisterWorker, registerWorker);
router.post('/register-user', authLimiter, validateRegisterUser, registerUser);
router.post('/verify-worker-email', authLimiter, validateOtpPayload, verifyWorkerEmail);
router.post('/resend-otp', authLimiter, validateEmailOnly, resendOtp);
router.post('/login', authLimiter, validateEmailAndPassword, login);
router.post('/forgot-password', authLimiter, validateEmailOnly, forgotPassword);
router.post('/reset-password', authLimiter, validateResetPassword, resetPassword);
router.post('/verify-reset-token', authLimiter, validateVerifyResetToken, verifyResetToken);
router.put('/profile', verifyToken, updateProfile);
router.post('/profile-image', verifyToken, uploadImageOnly.single('profile_image'), uploadProfileImage);
router.delete('/profile-image', verifyToken, removeProfileImage);

export default router;
