import { Router } from 'express';
import { registerWorker, registerUser, login } from '../controllers/auth.controller';

const router = Router();

router.post('/register/worker', registerWorker);
router.post('/register-user', registerUser);
router.post('/login', login);

export default router;