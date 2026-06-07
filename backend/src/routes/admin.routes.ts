import { Router } from 'express';
import { getHeroSlidesPublic } from '../controllers/admin.controller';
import { verifyToken, requireAdmin } from '../middlewares/auth.middleware';
import catalogRoutes from './admin/catalog.routes';
import contentRoutes from './admin/content.routes';
import financeRoutes from './admin/finance.routes';
import peopleRoutes from './admin/people.routes';
import requestRoutes from './admin/requests.routes';
import systemRoutes from './admin/system.routes';

const router = Router();

router.get('/hero-slides', getHeroSlidesPublic);
router.use(verifyToken, requireAdmin);
router.use(catalogRoutes);
router.use(contentRoutes);
router.use(financeRoutes);
router.use(peopleRoutes);
router.use(requestRoutes);
router.use(systemRoutes);

export default router;
