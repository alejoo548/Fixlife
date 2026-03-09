import { Router } from 'express';
import { getActiveServices } from '../controllers/services.controller';

const router = Router();

// Public route — no auth required
router.get('/', getActiveServices);

export default router;
