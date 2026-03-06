import { Router } from 'express';
import { registerWorker, registerUser, login, forgotPassword, resetPassword, verifyResetToken, uploadProfileImage } from '../controllers/auth.controller';
import { verifyToken } from '../middlewares/auth.middleware';
import { upload } from '../middlewares/upload.middleware';

const router = Router();

router.post('/register/worker', registerWorker);
router.post('/register-user', registerUser);
router.post('/login', login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/verify-reset-token", verifyResetToken);
router.post("/profile-image", verifyToken, upload.single('profile_image'), uploadProfileImage);

export default router;
