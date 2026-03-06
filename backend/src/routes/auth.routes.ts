import { Router } from 'express';
import { registerWorker, registerUser, login, forgotPassword, resetPassword, verifyResetToken } from '../controllers/auth.controller';

const router = Router();

router.post('/register/worker', registerWorker);
router.post('/register-user', registerUser);
router.post('/login', login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/verify-reset-token", verifyResetToken);

export default router;