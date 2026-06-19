import { Router } from 'express';
import path from 'path';
import { authLimiter, loginLimiter, forgotPasswordLimiter, passwordResetLimiter } from '../middlewares/security.middleware';
import { validate } from '../middlewares/validate.middleware';
import { AuthSchema } from '../schemas/auth.schema';
import { verifyToken } from '../middlewares/auth.middleware';
import { uploadImageOnly, validateUploadedFiles, sanitizeImages } from '../middlewares/upload.middleware';

const authController = require(path.join(__dirname, '../controllers/auth.controller'));
const {
  registerWorker,
  registerUser,
  login,
  googleLogin,
  verifyWorkerEmail,
  resendOtp,
  forgotPassword,
  resetPassword,
  verifyResetToken,
  uploadProfileImage,
  removeProfileImage,
  updateProfile,
} = authController;

const router = Router();

router.post('/register/worker', authLimiter, validate(AuthSchema.registerWorker), registerWorker);
router.post('/register-user', authLimiter, validate(AuthSchema.registerUser), registerUser);
router.post('/verify-worker-email', authLimiter, validate(AuthSchema.verifyEmail), verifyWorkerEmail);
router.post('/resend-otp', authLimiter, validate(AuthSchema.emailOnly), resendOtp);
router.post('/login', loginLimiter, validate(AuthSchema.login), login);
router.post('/google', authLimiter, validate(AuthSchema.googleLogin), googleLogin);
router.post('/forgot-password', forgotPasswordLimiter, validate(AuthSchema.emailOnly), forgotPassword);
router.post('/reset-password', passwordResetLimiter, validate(AuthSchema.resetPassword), resetPassword);
router.post('/verify-reset-token', passwordResetLimiter, validate(AuthSchema.verifyResetToken), verifyResetToken);
router.put('/profile', verifyToken, updateProfile);
router.post('/profile-image', verifyToken, uploadImageOnly.single('profile_image'), validateUploadedFiles, sanitizeImages, uploadProfileImage);
router.delete('/profile-image', verifyToken, removeProfileImage);

export default router;
