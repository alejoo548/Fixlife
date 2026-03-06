import { Router } from 'express';
import { registerWorker, registerUser, login, verifyWorkerEmail, resendOtp, forgotPassword, resetPassword, verifyResetToken } from '../controllers/auth.controller';
import { authLimiter } from '../middlewares/security.middleware';
import {
  validateEmailAndPassword,
  validateEmailOnly,
  validateOtpPayload,
  validateRegisterWorker,
} from '../middlewares/validation.middleware';

const router = Router();

router.post('/register/worker', authLimiter, validateRegisterWorker, registerWorker);
router.post('/register-user', registerUser);
router.post('/verify-worker-email', authLimiter, validateOtpPayload, verifyWorkerEmail);
router.post('/resend-otp', authLimiter, validateEmailOnly, resendOtp);
router.post('/login', authLimiter, validateEmailAndPassword, login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/verify-reset-token", verifyResetToken);

export default router;
