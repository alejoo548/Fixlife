import { Router } from 'express';
import {
  updateHeroSlides,
  uploadHeroImageAsset,
  uploadHeroSlideImage,
} from '../../controllers/admin.controller';
import { sensitiveLimiter } from '../../middlewares/security.middleware';
import { sanitizeImages, uploadImageOnly, validateUploadedFiles } from '../../middlewares/upload.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { AdminSchema } from '../../schemas/admin.schema';

const router = Router();

router.put('/hero-slides', sensitiveLimiter, validate(AdminSchema.heroSlides), updateHeroSlides);
router.post(
  '/hero-slides/image-upload',
  sensitiveLimiter,
  uploadImageOnly.single('image'),
  validateUploadedFiles,
  sanitizeImages,
  uploadHeroImageAsset
);
router.post(
  '/hero-slides/:idSlide/image',
  sensitiveLimiter,
  uploadImageOnly.single('image'),
  validateUploadedFiles,
  sanitizeImages,
  uploadHeroSlideImage
);

export default router;
