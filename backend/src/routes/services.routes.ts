import { Router } from 'express';
import {
  acceptAssignedWorker,
  approveServiceWorkflowAction,
  acceptCounterOffer,
  cancelServiceRequest,
  confirmRequestPayment,
  confirmServiceCompletion,
  createSavedLocation,
  createServiceRequest,
  createRequestPaymentCheckout,
  createServiceRequestReport,
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
import { uploadProtectedImageOnly, validateUploadedFiles, sanitizeImages } from '../middlewares/upload.middleware';
import {
  requestChatReadLimiter,
  requestChatSendLimiter,
  sensitiveLimiter,
  globalLimiter,
} from '../middlewares/security.middleware';

const router = Router();

router.get('/', getActiveServices);
router.get('/cards', getPublicServiceCards);
router.get('/geocode', sensitiveLimiter, geocodeLocation);
router.get('/geocode/suggest', sensitiveLimiter, suggestLocations);
router.get('/geocode/reverse', sensitiveLimiter, reverseGeocode);
router.get('/nearby-workers', sensitiveLimiter, getNearbyWorkers);
router.post('/payments/paypal/webhook', handlePaypalWebhook);
router.get('/saved-locations', verifyToken, getSavedLocations);
router.post('/saved-locations', verifyToken, createSavedLocation);
router.patch('/saved-locations/:idSavedLocation', verifyToken, updateSavedLocation);
router.delete('/saved-locations/:idSavedLocation', verifyToken, deleteSavedLocation);
router.delete('/saved-locations', verifyToken, clearSavedLocationsByKind);
router.get('/my-requests', verifyToken, getMyServiceRequests);
router.get('/requests/:idRequest/worker-profile', verifyToken, getRequestAssignedWorkerProfile);
router.post(
  '/requests',
  verifyToken,
  sensitiveLimiter,
  uploadProtectedImageOnly.array('problem_images', 5),
  validateUploadedFiles,
  sanitizeImages,
  createServiceRequest
);
router.post('/requests/:idRequest/cancel', verifyToken, sensitiveLimiter, cancelServiceRequest);
router.post('/requests/:idRequest/worker/accept', verifyToken, sensitiveLimiter, acceptAssignedWorker);
router.post('/requests/:idRequest/worker/decline', verifyToken, sensitiveLimiter, declineAssignedWorker);
router.post('/requests/:idRequest/counter/accept', verifyToken, sensitiveLimiter, acceptCounterOffer);
router.post('/requests/:idRequest/counter/decline', verifyToken, sensitiveLimiter, declineCounterOffer);
router.post('/requests/:idRequest/payment-checkout', verifyToken, sensitiveLimiter, createRequestPaymentCheckout);
router.post('/requests/:idRequest/payment-confirm', verifyToken, sensitiveLimiter, confirmRequestPayment);
router.post('/requests/:idRequest/confirm-completion', verifyToken, sensitiveLimiter, confirmServiceCompletion);
router.post('/requests/:idRequest/workflow-approval', verifyToken, sensitiveLimiter, approveServiceWorkflowAction);
router.post(
  '/requests/:idRequest/report',
  verifyToken,
  sensitiveLimiter,
  uploadProtectedImageOnly.array('report_images', 1),
  validateUploadedFiles,
  sanitizeImages,
  createServiceRequestReport
);
router.get('/requests/:idRequest/chat', verifyToken, requestChatReadLimiter, getRequestChat);
router.post(
  '/requests/:idRequest/chat',
  verifyToken,
  requestChatSendLimiter,
  uploadProtectedImageOnly.array('chat_images', 3),
  validateUploadedFiles,
  sanitizeImages,
  postRequestChatMessage
);
router.post('/requests/:idRequest/rating', verifyToken, sensitiveLimiter, submitRequestRating);

export default router;
