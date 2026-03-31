import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import {
  listUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../utils/notifications';

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

