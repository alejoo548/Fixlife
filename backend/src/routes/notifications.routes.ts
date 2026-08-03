import { Router } from 'express';
import { verifyToken } from '../middlewares/auth.middleware';
import {
  getMyNotifications,
  readAllNotifications,
  readNotification,
} from '../controllers/notifications.controller';

const router = Router();

router.get('/', verifyToken, getMyNotifications);
router.post('/read-all', verifyToken, readAllNotifications);
router.post('/:idNotification/read', verifyToken, readNotification);
export default router;