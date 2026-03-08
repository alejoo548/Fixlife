import { Router } from 'express';
import {
  getHeroSlidesPublic,
  updateHeroSlides,
  uploadHeroImageAsset,
  uploadHeroSlideImage,
} from '../controllers/admin.controller';
import { verifyToken } from '../middlewares/auth.middleware';
import { requireAdmin } from '../middlewares/admin.middleware';
import { sensitiveLimiter } from '../middlewares/security.middleware';
import { upload } from '../middlewares/upload.middleware';

const router = Router();

router.get('/hero-slides', getHeroSlidesPublic);

router.put('/hero-slides', verifyToken, requireAdmin, sensitiveLimiter, updateHeroSlides);
router.post(
  '/hero-slides/image-upload',
  verifyToken,
  requireAdmin,
  sensitiveLimiter,
  upload.single('image'),
  uploadHeroImageAsset
);
router.post(
  '/hero-slides/:idSlide/image',
  verifyToken,
  requireAdmin,
  sensitiveLimiter,
  upload.single('image'),
  uploadHeroSlideImage
);

export default router;
