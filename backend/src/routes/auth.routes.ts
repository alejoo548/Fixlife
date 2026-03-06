import { Router } from 'express';
import { registerWorker, login, verifyWorkerEmail, resendOtp } from '../controllers/auth.controller';
import { authLimiter } from '../middlewares/security.middleware';
import {
  validateEmailAndPassword,
  validateEmailOnly,
  validateOtpPayload,
  validateRegisterWorker,
} from '../middlewares/validation.middleware';

const router = Router();

router.post('/register/worker', authLimiter, validateRegisterWorker, registerWorker);
router.post('/verify-worker-email', authLimiter, validateOtpPayload, verifyWorkerEmail);
router.post('/resend-otp', authLimiter, validateEmailOnly, resendOtp);
router.post('/login', authLimiter, validateEmailAndPassword, login);

export default router;
