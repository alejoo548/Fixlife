import { Router } from 'express';
import { verifyToken } from '../middlewares/auth.middleware';
import {
  getMyNotifications,
  getPushPublicKey,
  readAllNotifications,
  readNotification,
  subscribeToPush,
  unsubscribeFromPush,
} from '../controllers/notifications.controller';

const router = Router();

router.get('/', verifyToken, getMyNotifications);
router.post('/read-all', verifyToken, readAllNotifications);
router.post('/:idNotification/read', verifyToken, readNotification);
router.get('/push/public-key', verifyToken, getPushPublicKey);
router.post('/push/subscribe', verifyToken, subscribeToPush);
router.post('/push/unsubscribe', verifyToken, unsubscribeFromPush);

export default router;

