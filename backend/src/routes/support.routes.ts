import { Router } from 'express';
import { verifyToken } from '../middlewares/auth.middleware';
import {
  getMySupportThreads,
  getAllSupportThreads,
  createSupportThread,
  getSupportThreadMessages,
  sendSupportMessage,
  updateSupportThreadStatus,
  assignSupportThread,
  getSupportThreadDetails,
} from '../controllers/support.controller';
import { sensitiveLimiter } from '../middlewares/security.middleware';
import { validate } from '../middlewares/validate.middleware';
import { SupportSchemas } from '../schemas/support.schema';
import { uploadProtectedImageOnly, validateUploadedFiles } from '../middlewares/upload.middleware';

const router = Router();

router.use(verifyToken);

router.get('/threads/all', getAllSupportThreads);

router.get('/threads', getMySupportThreads);
router.post('/threads', sensitiveLimiter, validate(SupportSchemas.createThread), createSupportThread);
router.get('/threads/:threadId', getSupportThreadDetails);
router.get('/threads/:threadId/messages', getSupportThreadMessages);
router.post(
  '/threads/:threadId/messages',
  sensitiveLimiter,
  uploadProtectedImageOnly.fields([
    { name: 'image', maxCount: 1 },
    { name: 'support_image', maxCount: 1 },
    { name: 'support_images', maxCount: 1 },
  ]),
  validateUploadedFiles,
  validate(SupportSchemas.sendMessage),
  sendSupportMessage
);
router.put(
  '/threads/:threadId/status',
  sensitiveLimiter,
  validate(SupportSchemas.updateThreadStatus),
  updateSupportThreadStatus
);
router.put(
  '/threads/:threadId/assign',
  sensitiveLimiter,
  validate(SupportSchemas.assignThread),
  assignSupportThread
);

export default router;
