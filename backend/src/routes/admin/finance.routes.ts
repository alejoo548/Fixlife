import { Router } from 'express';
import {
  createFinanceCaseAdmin,
  exportFinanceSettlementReportCsvAdmin,
  getCommissionRulesAdmin,
  getFinanceCasesAdmin,
  getFinanceClosureReportAdmin,
  getFinanceSettlementReportAdmin,
  getPaymentLedgerAdmin,
  getWorkerPayoutsAdmin,
  getWorkerRewardsAdminOverview,
  markWorkerBonusPayoutPaidController,
  markWorkerPayoutPaidController,
  resolveFinanceCaseAdmin,
  updateCommissionRulesAdmin,
  updateWorkerRewardsProgram,
} from '../../controllers/admin.controller';
import { sensitiveLimiter } from '../../middlewares/security.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { AdminSchema } from '../../schemas/admin.schema';

const router = Router();

router.get('/commission-rules', getCommissionRulesAdmin);
router.put('/commission-rules', sensitiveLimiter, validate(AdminSchema.commissionRules), updateCommissionRulesAdmin);
router.get('/worker-rewards', getWorkerRewardsAdminOverview);
router.put('/worker-rewards/settings', sensitiveLimiter, validate(AdminSchema.workerRewardsSettings), updateWorkerRewardsProgram);
router.post('/worker-rewards/payouts/:idBonusPayout/pay', sensitiveLimiter, validate(AdminSchema.payoutAction), markWorkerBonusPayoutPaidController);
router.get('/worker-payouts', getWorkerPayoutsAdmin);
router.post('/worker-payouts/:idWorkerPayout/pay', sensitiveLimiter, validate(AdminSchema.payoutAction), markWorkerPayoutPaidController);
router.get('/payment-ledger', getPaymentLedgerAdmin);
router.get('/finance-report', getFinanceSettlementReportAdmin);
router.get('/finance-report/export', exportFinanceSettlementReportCsvAdmin);
router.get('/finance-cases', getFinanceCasesAdmin);
router.post('/finance-cases', sensitiveLimiter, validate(AdminSchema.financeCaseCreate), createFinanceCaseAdmin);
router.post('/finance-cases/:idCase/resolve', sensitiveLimiter, validate(AdminSchema.financeCaseResolve), resolveFinanceCaseAdmin);
router.get('/finance-closures', getFinanceClosureReportAdmin);

export default router;
