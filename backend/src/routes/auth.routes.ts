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
import { validate } from '../middlewares/validate.middleware';
import { AuthSchema } from '../schemas/auth.schema';
import { verifyToken } from '../middlewares/auth.middleware';
import { uploadImageOnly } from '../middlewares/upload.middleware';

const router = Router();

router.post('/register/worker', authLimiter, validate(AuthSchema.registerWorker), registerWorker);
router.post('/register-user', authLimiter, validate(AuthSchema.registerUser), registerUser);
router.post('/verify-worker-email', authLimiter, validate(AuthSchema.verifyEmail), verifyWorkerEmail);
router.post('/resend-otp', authLimiter, validate(AuthSchema.emailOnly), resendOtp);
router.post('/login', authLimiter, validate(AuthSchema.login), login);
router.post('/forgot-password', authLimiter, validate(AuthSchema.emailOnly), forgotPassword);
router.post('/reset-password', authLimiter, validate(AuthSchema.resetPassword), resetPassword);
router.post('/verify-reset-token', authLimiter, validate(AuthSchema.verifyResetToken), verifyResetToken);
router.put('/profile', verifyToken, updateProfile);
router.post('/profile-image', verifyToken, uploadImageOnly.single('profile_image'), uploadProfileImage);
router.delete('/profile-image', verifyToken, removeProfileImage);

export default router;
