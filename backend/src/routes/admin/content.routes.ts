import { Router } from 'express';
import {
  updateHeroSlides,
  uploadHeroImageAsset,
  uploadHeroSlideImage,
} from '../../controllers/admin.controller';
import { sensitiveLimiter } from '../../middlewares/security.middleware';
import { uploadImageOnly } from '../../middlewares/upload.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { AdminSchema } from '../../schemas/admin.schema';

const router = Router();

router.put('/hero-slides', sensitiveLimiter, validate(AdminSchema.heroSlides), updateHeroSlides);
router.post('/hero-slides/image-upload', sensitiveLimiter, uploadImageOnly.single('image'), uploadHeroImageAsset);
router.post('/hero-slides/:idSlide/image', sensitiveLimiter, uploadImageOnly.single('image'), uploadHeroSlideImage);

export default router;
