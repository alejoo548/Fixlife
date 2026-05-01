import { Router } from 'express';
import {
  acceptAssignedWorker,
  acceptCounterOffer,
  cancelServiceRequest,
  confirmRequestPayment,
  confirmServiceCompletion,
  createSavedLocation,
  createServiceRequest,
  createRequestPaymentCheckout,
  clearSavedLocationsByKind,
  deleteSavedLocation,
  declineCounterOffer,
  declineAssignedWorker,
  geocodeLocation,
  getSavedLocations,
  reverseGeocode,
  handlePaypalWebhook,
  getRequestChat,
  getActiveServices,
  getMyServiceRequests,
  getNearbyWorkers,
  getRequestAssignedWorkerProfile,
  postRequestChatMessage,
  getPublicServiceCards,
  suggestLocations,
  submitRequestRating,
  updateSavedLocation,
} from '../controllers/services.controller';
import { verifyToken } from '../middlewares/auth.middleware';
import { uploadProtectedImageOnly } from '../middlewares/upload.middleware';

const router = Router();

router.get('/', getActiveServices);
router.get('/cards', getPublicServiceCards);
router.get('/geocode', geocodeLocation);
router.get('/geocode/suggest', suggestLocations);
router.get('/geocode/reverse', reverseGeocode);
router.get('/nearby-workers', getNearbyWorkers);
router.post('/payments/paypal/webhook', handlePaypalWebhook);
router.get('/saved-locations', verifyToken, getSavedLocations);
router.post('/saved-locations', verifyToken, createSavedLocation);
router.patch('/saved-locations/:idSavedLocation', verifyToken, updateSavedLocation);
router.delete('/saved-locations/:idSavedLocation', verifyToken, deleteSavedLocation);
router.delete('/saved-locations', verifyToken, clearSavedLocationsByKind);
router.get('/my-requests', verifyToken, getMyServiceRequests);
router.get('/requests/:idRequest/worker-profile', verifyToken, getRequestAssignedWorkerProfile);
router.post('/requests', verifyToken, uploadProtectedImageOnly.array('problem_images', 5), createServiceRequest);
router.post('/requests/:idRequest/cancel', verifyToken, cancelServiceRequest);
router.post('/requests/:idRequest/worker/accept', verifyToken, acceptAssignedWorker);
router.post('/requests/:idRequest/worker/decline', verifyToken, declineAssignedWorker);
router.post('/requests/:idRequest/counter/accept', verifyToken, acceptCounterOffer);
router.post('/requests/:idRequest/counter/decline', verifyToken, declineCounterOffer);
router.post('/requests/:idRequest/payment-checkout', verifyToken, createRequestPaymentCheckout);
router.post('/requests/:idRequest/payment-confirm', verifyToken, confirmRequestPayment);
router.post('/requests/:idRequest/confirm-completion', verifyToken, confirmServiceCompletion);
router.get('/requests/:idRequest/chat', verifyToken, getRequestChat);
router.post('/requests/:idRequest/chat', verifyToken, uploadProtectedImageOnly.array('chat_images', 3), postRequestChatMessage);
router.post('/requests/:idRequest/rating', verifyToken, submitRequestRating);

export default router;
