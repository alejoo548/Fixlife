import { Router } from 'express';
import {
  registerWorker,
  registerUser,
  login,
  forgotPassword,
  resetPassword,
  verifyResetToken,
  uploadProfileImage,
  removeProfileImage,
  updateProfile
} from '../controllers/auth.controller';
import { verifyToken } from '../middlewares/auth.middleware';
import { uploadImageOnly } from '../middlewares/upload.middleware';

const router = Router();

router.post('/register/worker', registerWorker);
router.post('/register-user', registerUser);
router.post('/login', login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/verify-reset-token", verifyResetToken);
router.put('/profile', verifyToken, updateProfile);
router.post('/profile-image', verifyToken, uploadImageOnly.single('profile_image'), uploadProfileImage);
router.delete('/profile-image', verifyToken, removeProfileImage);

export default router;
