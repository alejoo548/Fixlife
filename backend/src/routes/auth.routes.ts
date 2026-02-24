import { Router } from 'express';
import { registerWorker, login } from '../controllers/auth.controller';

const router = Router();

router.post('/register/worker', registerWorker);
router.post('/login', login);

export default router;