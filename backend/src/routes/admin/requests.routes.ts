import { Router } from 'express';
import {
  getRequestDetailAdmin,
  getRequestsHistory,
  updateRequestAdmin,
} from '../../controllers/admin.controller';
import { sensitiveLimiter } from '../../middlewares/security.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { AdminSchema } from '../../schemas/admin.schema';

const router = Router();

router.get('/requests-history', getRequestsHistory);
router.get('/requests/:idRequest', getRequestDetailAdmin);
router.post('/requests/:idRequest/actions', sensitiveLimiter, validate(AdminSchema.requestAction), updateRequestAdmin);

export default router;
