import { Router } from 'express';
import {
  acceptCounterOffer,
  createServiceRequest,
  declineCounterOffer,
  getRequestChat,
  getActiveServices,
  getMyServiceRequests,
  getNearbyWorkers,
  postRequestChatMessage,
  getPublicServiceCards,
  submitRequestRating,
} from '../controllers/services.controller';
import { verifyToken } from '../middlewares/auth.middleware';
import { upload } from '../middlewares/upload.middleware';

const router = Router();

router.get('/', getActiveServices);
router.get('/cards', getPublicServiceCards);
router.get('/nearby-workers', getNearbyWorkers);
router.get('/my-requests', verifyToken, getMyServiceRequests);
router.post('/requests', verifyToken, upload.array('problem_images', 5), createServiceRequest);
router.post('/requests/:idRequest/counter/accept', verifyToken, acceptCounterOffer);
router.post('/requests/:idRequest/counter/decline', verifyToken, declineCounterOffer);
router.get('/requests/:idRequest/chat', verifyToken, getRequestChat);
router.post('/requests/:idRequest/chat', verifyToken, upload.array('chat_images', 3), postRequestChatMessage);
router.post('/requests/:idRequest/rating', verifyToken, submitRequestRating);

export default router;
