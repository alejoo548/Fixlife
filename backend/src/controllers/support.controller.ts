import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import {
  createThread,
  getThreadsForUser,
  getAllThreadsForAdmin,
  getThreadById,
  getMessagesForThread,
  insertMessage,
  getMessageById,
  userCanAccessThread,
  updateThreadStatus,
  assignThreadToAdmin,
  getThreadWithDetails,
  mapThreadRow,
  mapThreadDetailRow,
  mapMessageRow,
  SupportMessageRow,
} from '../services/support.service';
import { emitNewSupportMessage, emitSupportThreadCreated } from '../services/supportSocket.service';
import { deleteUploadIfExists } from '../utils/assets';
import { sanitizeImageInPlace, ImageSanitizeError } from '../utils/imageSanitizer';
import { notifyAdmins } from '../utils/notifications';
import { sanitizeNameLike, sanitizeMessage } from '../utils/sanitize';
import { moderateUserText } from '../utils/moderation';

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

const parseThreadId = (raw: unknown): number | null => {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
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

    const subject = sanitizeNameLike(req.body.subject, 120);
    const initialMessage = sanitizeMessage(req.body.initialMessage, 2000);
    const priority = req.body.priority || 'normal';

    if (!subject || subject.length < 3) {
      res.status(400).json({ error: 'Subject is required (min 3 characters)' });
      return;
    }
    const subjectModeration = moderateUserText(subject, { allowLinks: false, allowHelpSeeking: true });
    const messageModeration = moderateUserText(initialMessage, { allowLinks: false, allowHelpSeeking: true });
    if (!subjectModeration.ok || !messageModeration.ok) {
      res.status(400).json({ error: subjectModeration.reason || messageModeration.reason || 'Support case contains content that is not allowed.' });
      return;
    }

    const threadId = await createThread(userId, subject, priority);

    let initialSupportMessage = null;
    if (initialMessage) {
      const role = req.user?.rol === 'worker' ? 'worker' : 'client';
      const messageId = await insertMessage(threadId, userId, role, initialMessage);
      const messageRow = await getMessageById(messageId);
      initialSupportMessage = messageRow ? mapMessageRow(messageRow) : null;
    }

    const thread = await getThreadById(threadId);
    const mappedThread = thread ? mapThreadRow(thread) : null;
    if (mappedThread) {
      emitSupportThreadCreated({ thread: mappedThread, message: initialSupportMessage });
      if (req.user?.rol !== 'admin' && req.user?.rol !== 'root') {
        notifyAdmins({
          eventType: 'support_thread_created',
          title: 'New support case opened',
          message: `${mappedThread.userName || 'A user'} opened a support case: ${mappedThread.subject}`,
          tone: 'info',
          actionUrl: '/admin-dashboard/support',
          dedupeKey: `support_thread_${threadId}`,
          metadata: { threadId },
        }).catch(() => undefined);
      }
    }
    res.status(201).json({ success: true, thread: mappedThread });
  } catch (error) {
    console.error('[Support] createSupportThread error:', error);
    res.status(500).json({ error: 'Failed to create support thread' });
  }
};

export const getSupportThreadMessages = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.user_id;
    const role = req.user?.rol || 'client';
    const threadId = parseThreadId(req.params.threadId);

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!threadId) {
      res.status(400).json({ error: 'Invalid thread id' });
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
    const threadId = parseThreadId(req.params.threadId);
    const message = sanitizeMessage(req.body.message, 2000);

    if (!userId) {
      removeUploadedSupportImages(uploadedImages);
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!threadId) {
      removeUploadedSupportImages(uploadedImages);
      res.status(400).json({ error: 'Invalid thread id' });
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
    if (trimmed) {
      const moderation = moderateUserText(trimmed, { allowLinks: false, allowHelpSeeking: true });
      if (!moderation.ok) {
        removeUploadedSupportImages(uploadedImages);
        res.status(400).json({ error: moderation.reason || 'Message contains content that is not allowed.' });
        return;
      }
    }

    if (uploadedImages.length > 0) {
      try {
        for (const file of uploadedImages) {
          await sanitizeImageInPlace(file);
        }
      } catch (err) {
        removeUploadedSupportImages(uploadedImages);
        const msg = err instanceof ImageSanitizeError ? err.message : 'Invalid image upload.';
        res.status(400).json({ error: msg });
        return;
      }
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

    const messageRow = await getMessageById(messageId);
    if (!messageRow) {
      res.status(500).json({ error: 'Failed to send message' });
      return;
    }

    const mapped = mapMessageRow(messageRow as SupportMessageRow);

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

    const threadId = parseThreadId(req.params.threadId);
    const { status } = req.body;

    if (!threadId) {
      res.status(400).json({ error: 'Invalid thread id' });
      return;
    }

    const success = await updateThreadStatus(threadId, status);

    if (!success) {
      res.status(404).json({ error: 'Thread not found' });
      return;
    }

    const thread = await getThreadWithDetails(threadId);
    res.json({ success: true, thread: thread ? mapThreadDetailRow(thread) : null });
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

    const threadId = parseThreadId(req.params.threadId);
    const { adminUserId } = req.body;

    if (!threadId) {
      res.status(400).json({ error: 'Invalid thread id' });
      return;
    }

    const success = await assignThreadToAdmin(threadId, adminUserId);

    if (!success) {
      res.status(400).json({ error: 'Could not assign thread (admin not found or thread does not exist)' });
      return;
    }

    const thread = await getThreadWithDetails(threadId);
    res.json({ success: true, thread: thread ? mapThreadDetailRow(thread) : null });
  } catch (error) {
    console.error('[Support] assignSupportThread error:', error);
    res.status(500).json({ error: 'Failed to assign thread' });
  }
};

export const getSupportThreadDetails = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.user_id;
    const role = req.user?.rol || 'client';
    const threadId = parseThreadId(req.params.threadId);

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!threadId) {
      res.status(400).json({ error: 'Invalid thread id' });
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

    res.json({ success: true, thread: mapThreadDetailRow(thread) });
  } catch (error) {
    console.error('[Support] getSupportThreadDetails error:', error);
    res.status(500).json({ error: 'Failed to load thread' });
  }
};
