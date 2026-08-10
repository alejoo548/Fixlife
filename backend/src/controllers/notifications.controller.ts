import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import {
  listUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../utils/notifications';
import { removeSubscription, saveSubscription } from '../services/webPush.service';

export const getMyNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const limit = Number(req.query.limit || 30);
    const unreadOnly = String(req.query.unread_only || '').toLowerCase() === 'true';
    const payload = await listUserNotifications(userId, { limit, unreadOnly });

    res.json({
      success: true,
      ...payload,
    });
  } catch (error: any) {
    console.error('Error in getMyNotifications:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const readNotification = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const idNotification = Number(req.params.idNotification);
    if (!idNotification) {
      res.status(400).json({ error: 'Invalid notification id.' });
      return;
    }

    const updated = await markNotificationRead(userId, idNotification);
    if (!updated) {
      res.status(404).json({ error: 'Notification not found.' });
      return;
    }

    res.json({
      success: true,
      message: 'Notification marked as read.',
    });
  } catch (error: any) {
    console.error('Error in readNotification:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const readAllNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const updated = await markAllNotificationsRead(userId);
    res.json({
      success: true,
      message: updated > 0 ? 'All notifications marked as read.' : 'No unread notifications.',
      updated,
    });
  } catch (error: any) {
    console.error('Error in readAllNotifications:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getPushPublicKey = async (_req: AuthRequest, res: Response): Promise<void> => {
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || '').trim();
  if (!publicKey) {
    res.status(503).json({ error: 'Push notifications are not configured on this server.' });
    return;
  }
  res.json({ success: true, public_key: publicKey });
};

export const subscribeToPush = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { endpoint, keys } = req.body || {};
    const p256dh = keys?.p256dh;
    const auth = keys?.auth;
    if (!endpoint || typeof endpoint !== 'string' || !p256dh || !auth) {
      res.status(400).json({ error: 'Invalid push subscription payload.' });
      return;
    }

    await saveSubscription({
      userId,
      endpoint: String(endpoint).slice(0, 512),
      p256dh: String(p256dh).slice(0, 255),
      auth: String(auth).slice(0, 255),
      userAgent: String(req.headers['user-agent'] || '').slice(0, 255),
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error in subscribeToPush:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const unsubscribeFromPush = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const endpoint = req.body?.endpoint;
    if (!endpoint || typeof endpoint !== 'string') {
      res.status(400).json({ error: 'Invalid endpoint.' });
      return;
    }

    await removeSubscription(userId, endpoint);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error in unsubscribeFromPush:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

