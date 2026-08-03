import { Router } from 'express';
import {
  acceptWorkerRequest,
  arriveWorkerRequest,
  cancelWorkerAssignedRequest,
  completeWorkerRequest,
  counterOfferWorkerRequest,
  changeWorkerPassword,
  deletePortfolioImage,
  downloadWorkerRewardsStatementPdf,
  getWorkerMe,
  getWorkerAppointments,
  getWorkerAvailability,
  getWorkerRewardsDashboard,
  getWorkerWorkspace,
  getWorkerRequests,
  rejectWorkerRequest,
  reportClientNoShow,
  requestWorkerEmailChangeToken,
  removeWorkerProfileImage,
  startWorkerRequest,
  startWorkerRoute,
  updatePortfolioImageDescription,
  updateWorkerSettings,
  updateWorkerAvailability,
  uploadDocuments,
  uploadPortfolioImages,
  uploadProfileImage,
  updateWorkerPresence,
  verifyWorkerEmailChangeToken,
} from '../controllers/worker.controller';
import {
  requireVerifiedWorker,
  requireWorker,
  verifyToken,
} from '../middlewares/auth.middleware';
import { sensitiveLimiter } from '../middlewares/security.middleware';
import { upload, uploadImageOnly, validateUploadedFiles, sanitizeImages } from '../middlewares/upload.middleware';
import { validate } from '../middlewares/validate.middleware';
import { WorkerSchema } from '../schemas/worker.schema';

const router = Router();

router.use(verifyToken, requireWorker);

router.get('/me', getWorkerMe);
router.get('/availability', getWorkerAvailability);
router.put('/availability', sensitiveLimiter, validate(WorkerSchema.availability), updateWorkerAvailability);
router.get('/rewards-dashboard', requireVerifiedWorker, getWorkerRewardsDashboard);
router.get('/rewards-dashboard/statement.pdf', requireVerifiedWorker, downloadWorkerRewardsStatementPdf);
router.get('/requests', requireVerifiedWorker, getWorkerRequests);
router.get('/workspace', requireVerifiedWorker, getWorkerWorkspace);
router.get('/appointments', requireVerifiedWorker, getWorkerAppointments);
router.post('/requests/:idRequest/accept', requireVerifiedWorker, sensitiveLimiter, acceptWorkerRequest);
router.post('/requests/:idRequest/reject', requireVerifiedWorker, sensitiveLimiter, rejectWorkerRequest);
router.post('/requests/:idRequest/cancel', requireVerifiedWorker, sensitiveLimiter, cancelWorkerAssignedRequest);
router.post('/requests/:idRequest/client-no-show', requireVerifiedWorker, sensitiveLimiter, reportClientNoShow);
router.post('/requests/:idRequest/counter-offer', requireVerifiedWorker, sensitiveLimiter, counterOfferWorkerRequest);
router.post('/requests/:idRequest/arrive', requireVerifiedWorker, sensitiveLimiter, arriveWorkerRequest);
router.post('/requests/:idRequest/route-start', requireVerifiedWorker, sensitiveLimiter, startWorkerRoute);
router.post('/requests/:idRequest/start', requireVerifiedWorker, sensitiveLimiter, startWorkerRequest);
router.post('/requests/:idRequest/complete', requireVerifiedWorker, sensitiveLimiter, completeWorkerRequest);
router.put('/presence', requireVerifiedWorker, updateWorkerPresence);
router.put('/settings', sensitiveLimiter, validate(WorkerSchema.settings), updateWorkerSettings);
router.put('/change-password', sensitiveLimiter, validate(WorkerSchema.changePassword), changeWorkerPassword);
router.post('/email-change/request', sensitiveLimiter, validate(WorkerSchema.emailChangeRequest), requestWorkerEmailChangeToken);
router.post('/email-change/verify', sensitiveLimiter, validate(WorkerSchema.tokenOnly), verifyWorkerEmailChangeToken);
router.post('/profile-image', sensitiveLimiter, uploadImageOnly.single('profile_image'), validateUploadedFiles, sanitizeImages, uploadProfileImage);
router.delete('/profile-image', sensitiveLimiter, removeWorkerProfileImage);
router.post('/portfolio', sensitiveLimiter, uploadImageOnly.array('portfolio_images', 10), validateUploadedFiles, sanitizeImages, uploadPortfolioImages);
router.put('/portfolio/:idPhoto', sensitiveLimiter, updatePortfolioImageDescription);
router.delete('/portfolio/:idPhoto', sensitiveLimiter, deletePortfolioImage);

router.post(
  '/verify',
  upload.fields([
    { name: 'dui_document', maxCount: 1 },
    { name: 'cert_document', maxCount: 1 }
  ]),
  validateUploadedFiles,
  sanitizeImages,
  uploadDocuments
);

export default router;
