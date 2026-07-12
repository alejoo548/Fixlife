import { Router } from 'express';
import { getPublicReviews, submitPlatformReview } from '../controllers/reviews.controller';
import { verifyToken } from '../middlewares/auth.middleware';
import { sensitiveLimiter } from '../middlewares/security.middleware';

const router = Router();

router.get('/public', getPublicReviews);
router.post('/', verifyToken, sensitiveLimiter, submitPlatformReview);

export default router;
