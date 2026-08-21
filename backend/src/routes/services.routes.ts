import { Router } from 'express';
import {
  acceptAssignedWorker,
  approveServiceWorkflowAction,
  acceptCounterOffer,
  cancelServiceRequest,
  confirmCashPayment,
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
  getDrivingRouteHandler,
  getSavedLocations,
  reverseGeocode,
  handlePaypalWebhook,
  handleWompiWebhook,
  getRequestChat,
  getActiveServices,
  getMyServiceRequests,
  getNearbyWorkers,
  getRequestAssignedWorkerProfile,
  postRequestChatMessage,
  getPublicServiceCards,
  getServicePriceSuggestion,
  handleVirtualWalletWebhook,
  handleVirtualWalletReturnRedirect,
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
  lookupLimiter,
  globalLimiter,
} from '../middlewares/security.middleware';

const router = Router();

router.get('/', getActiveServices);
router.get('/cards', getPublicServiceCards);
router.get('/price-suggestion/:idService', lookupLimiter, getServicePriceSuggestion);
router.get('/geocode', lookupLimiter, geocodeLocation);
router.get('/geocode/suggest', lookupLimiter, suggestLocations);
router.get('/geocode/reverse', lookupLimiter, reverseGeocode);
router.get('/route', lookupLimiter, getDrivingRouteHandler);
router.get('/nearby-workers', lookupLimiter, getNearbyWorkers);
router.post('/payments/paypal/webhook', handlePaypalWebhook);
router.post('/payments/wompi/webhook/:token', handleWompiWebhook);
router.post('/payments/virtual-wallet/webhook', handleVirtualWalletWebhook);
router.get('/payments/virtual-wallet/webhook', handleVirtualWalletReturnRedirect);
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
router.post('/requests/:idRequest/cash-confirm', verifyToken, sensitiveLimiter, confirmCashPayment);
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
