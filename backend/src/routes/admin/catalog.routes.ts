import { Router } from 'express';
import {
  createService,
  createServiceCard,
  deleteService,
  deleteServiceCard,
  getAllServices,
  getServiceCardsAdmin,
  updateService,
  updateServiceCard,
} from '../../controllers/admin.controller';
import { sensitiveLimiter } from '../../middlewares/security.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { AdminSchema } from '../../schemas/admin.schema';

const router = Router();

router.get('/services', getAllServices);
router.post('/services', sensitiveLimiter, validate(AdminSchema.createService), createService);
router.put('/services/:id', sensitiveLimiter, validate(AdminSchema.updateService), updateService);
router.delete('/services/:id', sensitiveLimiter, deleteService);

router.get('/service-cards', getServiceCardsAdmin);
router.post('/service-cards', sensitiveLimiter, validate(AdminSchema.createServiceCard), createServiceCard);
router.put('/service-cards/:idCard', sensitiveLimiter, validate(AdminSchema.updateServiceCard), updateServiceCard);
router.delete('/service-cards/:idCard', sensitiveLimiter, deleteServiceCard);

export default router;
