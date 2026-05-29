import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import {
  createThread,
  getThreadsForUser,
  getAllThreadsForAdmin,
  getThreadById,
  getMessagesForThread,
  insertMessage,
  userCanAccessThread,
  updateThreadStatus,
  assignThreadToAdmin,
  getThreadWithDetails,
  mapThreadRow,
  mapMessageRow,
  SupportMessageRow,
} from '../services/support.service';
import pool from '../config/db';
import { emitNewSupportMessage } from '../services/supportSocket.service';
import { deleteUploadIfExists } from '../utils/assets';

const getUploadedSupportImages = (req: Request): Express.Multer.File[] => {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;
  if (req.files && typeof req.files === 'object') {
    return Object.values(req.files).flat();
  }
  return [];
};

const removeUploadedSupportImages = (files: Express.Multer.File[]) => {
  files.forEach((file) => {
    if (file.filename) deleteUploadIfExists(file.filename, 'protected');
  });
};

export const getMySupportThreads = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const threads = await getThreadsForUser(userId);
    res.json({ success: true, threads: threads.map(mapThreadRow) });
  } catch (error) {
    console.error('[Support] getMySupportThreads error:', error);
    res.status(500).json({ error: 'Failed to load support threads' });
  }
};

export const getAllSupportThreads = async (req: AuthRequest, res: Response) => {
  try {
    const role = req.user?.rol;
    if (role !== 'admin' && role !== 'root') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const threads = await getAllThreadsForAdmin();
    res.json({ success: true, threads: threads.map(mapThreadRow) });
  } catch (error) {
    console.error('[Support] getAllSupportThreads error:', error);
    res.status(500).json({ error: 'Failed to load support threads' });
  }
};

export const createSupportThread = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { subject, priority = 'normal', initialMessage } = req.body;

    if (!subject || typeof subject !== 'string' || subject.trim().length < 3) {
      res.status(400).json({ error: 'Subject is required (min 3 characters)' });
      return;
    }

    const threadId = await createThread(userId, subject.trim(), priority);

    if (initialMessage && typeof initialMessage === 'string' && initialMessage.trim()) {
      const role = req.user?.rol === 'worker' ? 'worker' : 'client';
      await insertMessage(threadId, userId, role, initialMessage.trim());
    }

    const thread = await getThreadById(threadId);
    res.status(201).json({ success: true, thread: thread ? mapThreadRow(thread) : null });
  } catch (error) {
    console.error('[Support] createSupportThread error:', error);
    res.status(500).json({ error: 'Failed to create support thread' });
  }
};

export const getSupportThreadMessages = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.user_id;
    const role = req.user?.rol || 'client';
    const threadId = Number(req.params.threadId);

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const canAccess = await userCanAccessThread(threadId, userId, role);
    if (!canAccess) {
      res.status(403).json({ error: 'You do not have access to this thread' });
      return;
    }

    const messages = await getMessagesForThread(threadId);
    res.json({ success: true, messages: messages.map(mapMessageRow) });
  } catch (error) {
    console.error('[Support] getSupportThreadMessages error:', error);
    res.status(500).json({ error: 'Failed to load messages' });
  }
};

export const sendSupportMessage = async (req: AuthRequest, res: Response) => {
  const uploadedImages = getUploadedSupportImages(req);
  try {
    const userId = req.user?.user_id;
    const role = req.user?.rol || 'client';
    const threadId = Number(req.params.threadId);
    const { message } = req.body;

    if (!userId) {
      removeUploadedSupportImages(uploadedImages);
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const canAccess = await userCanAccessThread(threadId, userId, role);
    if (!canAccess) {
      removeUploadedSupportImages(uploadedImages);
      res.status(403).json({ error: 'You do not have access to this thread' });
      return;
    }

    const trimmed = message?.trim();
    if (!trimmed && uploadedImages.length === 0) {
      res.status(400).json({ error: 'Message or image is required' });
      return;
    }

    const imageUrl = uploadedImages[0]?.filename || null;

    const senderRole = role === 'admin' || role === 'root' ? 'admin' : (role === 'worker' ? 'worker' : 'client');

    const messageId = await insertMessage(
      threadId,
      userId,
      senderRole,
      trimmed || null,
      imageUrl
    );

    const [newMessageRows] = await pool.execute(
      `SELECT sm.*, u.name AS sender_name, u.lastname AS sender_lastname
       FROM support_messages sm
       LEFT JOIN users u ON u.id_user = sm.sender_user_id
       WHERE sm.id = ?`,
      [messageId]
    );

    const mapped = mapMessageRow((newMessageRows as SupportMessageRow[])[0]);

    emitNewSupportMessage(threadId, mapped);

    res.status(201).json({
      success: true,
      message: mapped,
    });
  } catch (error) {
    removeUploadedSupportImages(uploadedImages);
    console.error('[Support] sendSupportMessage error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};


export const updateSupportThreadStatus = async (req: AuthRequest, res: Response) => {
  try {
    const role = req.user?.rol;
    if (role !== 'admin' && role !== 'root') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const threadId = Number(req.params.threadId);
    const { status } = req.body;

    const success = await updateThreadStatus(threadId, status);

    if (!success) {
      res.status(404).json({ error: 'Thread not found' });
      return;
    }

    const thread = await getThreadWithDetails(threadId);
    res.json({ success: true, thread });
  } catch (error) {
    console.error('[Support] updateSupportThreadStatus error:', error);
    res.status(500).json({ error: 'Failed to update thread status' });
  }
};

export const assignSupportThread = async (req: AuthRequest, res: Response) => {
  try {
    const role = req.user?.rol;
    if (role !== 'admin' && role !== 'root') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const threadId = Number(req.params.threadId);
    const { adminUserId } = req.body;

    const success = await assignThreadToAdmin(threadId, adminUserId);

    if (!success) {
      res.status(400).json({ error: 'Could not assign thread (admin not found or thread does not exist)' });
      return;
    }

    const thread = await getThreadWithDetails(threadId);
    res.json({ success: true, thread });
  } catch (error) {
    console.error('[Support] assignSupportThread error:', error);
    res.status(500).json({ error: 'Failed to assign thread' });
  }
};

export const getSupportThreadDetails = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.user_id;
    const role = req.user?.rol || 'client';
    const threadId = Number(req.params.threadId);

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const canAccess = await userCanAccessThread(threadId, userId, role);
    if (!canAccess) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const thread = await getThreadWithDetails(threadId);
    if (!thread) {
      res.status(404).json({ error: 'Thread not found' });
      return;
    }

    res.json({ success: true, thread });
  } catch (error) {
    console.error('[Support] getSupportThreadDetails error:', error);
    res.status(500).json({ error: 'Failed to load thread' });
  }
};
