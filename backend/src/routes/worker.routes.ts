import { Router } from 'express';
import { uploadDocuments } from '../controllers/worker.controller';
import { verifyToken } from '../middlewares/auth.middleware';
import { upload } from '../middlewares/upload.middleware';

const router = Router();

router.post(
  '/verify', 
  verifyToken, 
  upload.fields([
    { name: 'dui_document', maxCount: 1 }, 
    { name: 'cert_document', maxCount: 1 }
  ]), 
  uploadDocuments
);

export default router;