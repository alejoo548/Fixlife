import { Router } from 'express';
import { registerWorker, login, verifyWorkerEmail, resendOtp } from '../controllers/auth.controller';

const router = Router();

router.post('/register/worker', registerWorker);
router.post('/verify-worker-email', verifyWorkerEmail);
router.post('/resend-otp', resendOtp);
router.post('/login', login);

export default router;