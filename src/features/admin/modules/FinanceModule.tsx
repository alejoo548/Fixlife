import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Banknote, DollarSign, Receipt, RefreshCw, Scale, WalletCards } from 'lucide-react';
import { adminApi } from '../api/adminApi';
import { AdminCard, AdminNumberInput, ConfirmActionDialog, DataTable, EmptyState, FormSection, MetricCard, Skeleton, StatusBadge } from '../components/AdminUI';
import { adminErrorMessage, adminFinanceLabel, adminServiceName, useAdminT } from '../adminI18n';

type FinanceTab = 'overview' | 'payouts' | 'bonuses' | 'cases' | 'ledger' | 'rules';
type LedgerEntry = { id_ledger_entry:number; entry_type:string; amount:number; currency_code:string; entry_status:string; service_name:string|null; id_request:number|null; created_at:string };
type WorkerPayout = { id_worker_payout:number; id_user:number|null; id_request:number|null; worker_name:string; gross_amount:number; platform_fee:number; net_amount:number; payout_status:string; scheduled_for:string; paid_at:string|null; service_name:string|null };
type BonusPayout = { id_bonus_payout:number; id_user:number|null; worker_name:string; bonus_type:string; bonus_amount:number; payout_status:string; scheduled_for:string; paid_at:string|null; service_name:string|null };
type FinanceCase = { id_case:number; case_type:string; case_status:string; direction:string; id_request:number|null; id_payment:number|null; amount:number; currency_code:string; reason:string|null; notes:string|null; created_at:string; resolved_at:string|null };
type RewardForm = { trial_min_completed_jobs:string; commission_rate_percent:string; royalty_rate_percent:string; royalty_min_jobs:string; royalty_min_completion_rate:string };

export default function FinanceModule() {
  const { t, lang } = useAdminT();
  const locale = lang === 'es' ? 'es-ES' : 'en-US';
  const money = (value: number, currency = 'USD') => Number(value || 0).toLocaleString(locale, { style: 'currency', currency });
  const [tab, setTab] = useState<FinanceTab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [report, setReport] = useState<any>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [workerPayouts, setWorkerPayouts] = useState<WorkerPayout[]>([]);
  const [workerSummary, setWorkerSummary] = useState<any>(null);
  const [bonusPayouts, setBonusPayouts] = useState<BonusPayout[]>([]);
  const [bonusSummary, setBonusSummary] = useState<any>(null);
  const [rewardSettings, setRewardSettings] = useState<any>(null);
  const [cases, setCases] = useState<FinanceCase[]>([]);
  const [closure, setClosure] = useState<any>(null);
  const [commission, setCommission] = useState<any>(null);
  const [commissionRate, setCommissionRate] = useState('12');
  const [rewardForm, setRewardForm] = useState<RewardForm>({ trial_min_completed_jobs:'', commission_rate_percent:'', royalty_rate_percent:'', royalty_min_jobs:'', royalty_min_completion_rate:'' });
  const [payoutAction, setPayoutAction] = useState<{ type:'worker'|'bonus'; id:number; label:string } | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [resolveTarget, setResolveTarget] = useState<FinanceCase | null>(null);
  const [resolveNotes, setResolveNotes] = useState('');
  const [caseForm, setCaseForm] = useState({ case_type:'refund', direction:'customer_refund', id_request:'', id_payment:'', amount:'', reason:'', notes:'' });

  const range = useMemo(() => {
    const to = new Date(); const from = new Date(); from.setDate(to.getDate() - 29);
    return { from: from.toISOString().slice(0,10), to: to.toISOString().slice(0,10) };
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const query = new URLSearchParams(range);
      const [reportPayload, ledgerPayload, workerPayload, bonusPayload, casePayload, closurePayload, commissionPayload] = await Promise.all([
        adminApi.get<any>(`${adminApi.endpoints.financeReport}?${query}`),
        adminApi.get<any>(`${adminApi.endpoints.paymentLedger}?limit=100`),
        adminApi.get<any>(`${adminApi.endpoints.workerPayouts}?status=all`),
        adminApi.get<any>(`${adminApi.endpoints.workerRewards}?status=all`),
        adminApi.get<any>(`${adminApi.endpoints.financeCases}?limit=100`),
        adminApi.get<any>(`${adminApi.endpoints.financeClosures}?period=weekly&${query}`),
        adminApi.get<any>(adminApi.endpoints.commissionRules),
      ]);
      setReport(reportPayload); setLedger(ledgerPayload.entries || []);
      setWorkerPayouts(workerPayload.payouts || []); setWorkerSummary(workerPayload.summary || null);
      setBonusPayouts(bonusPayload.payouts || []); setBonusSummary(bonusPayload.summary || null); setRewardSettings(bonusPayload.settings || null);
      setCases(casePayload.cases || []); setClosure(closurePayload); setCommission(commissionPayload);
      setCommissionRate(String(commissionPayload.global_rate_percent ?? 12));
      const settings = bonusPayload.settings || {};
      setRewardForm({
        trial_min_completed_jobs:String(settings.trial_min_completed_jobs ?? ''),
        commission_rate_percent:String(Number(settings.commission_rate || 0) * 100),
        royalty_rate_percent:String(Number(settings.royalty_rate || 0) * 100),
        royalty_min_jobs:String(settings.royalty_min_jobs ?? ''),
        royalty_min_completion_rate:String(settings.royalty_min_completion_rate ?? ''),
      });
    } catch (reason) { setError(adminErrorMessage(reason, t('finance.loadError'), t)); }
    finally { setLoading(false); }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const markPaid = async () => {
    if (!payoutAction) return; setSaving(true);
    try {
      const endpoint = payoutAction.type === 'worker' ? adminApi.endpoints.markWorkerPayoutPaid(payoutAction.id) : adminApi.endpoints.markWorkerBonusPaid(payoutAction.id);
      await adminApi.post(endpoint, { reason }); setPayoutAction(null); setReason(''); await load();
    } catch (reason) { setError(adminErrorMessage(reason, t('finance.markPaidError'), t)); }
    finally { setSaving(false); }
  };

  const createCase = async () => {
    setSaving(true); setError('');
    try {
      await adminApi.post(adminApi.endpoints.financeCases, {
        case_type: caseForm.case_type, direction: caseForm.direction,
        id_request: caseForm.id_request ? Number(caseForm.id_request) : undefined,
        id_payment: caseForm.id_payment ? Number(caseForm.id_payment) : undefined,
        amount: Number(caseForm.amount), currency_code: 'USD', reason: caseForm.reason, notes: caseForm.notes,
      });
      setCaseForm({ case_type:'refund', direction:'customer_refund', id_request:'', id_payment:'', amount:'', reason:'', notes:'' }); await load();
    } catch (reason) { setError(adminErrorMessage(reason, t('finance.createCaseError'), t)); }
    finally { setSaving(false); }
  };

  const confirmResolve = async () => {
    if (!resolveTarget || resolveNotes.trim().length < 8) return;
    setSaving(true);
    try {
      await adminApi.post(adminApi.endpoints.resolveFinanceCase(resolveTarget.id_case), { resolution_notes: resolveNotes.trim(), apply_ledger: true });
      setResolveTarget(null); setResolveNotes(''); await load();
    } catch (reason) { setError(adminErrorMessage(reason, t('finance.resolveCaseError'), t)); }
    finally { setSaving(false); }
  };

  const saveCommission = async () => {
    if (!commission) return; setSaving(true);
    try {
      await adminApi.put(adminApi.endpoints.commissionRules, {
        global_rate_percent: Number(commissionRate),
        service_overrides: commission.service_overrides || [], urgency_adjustments: commission.urgency_adjustments || [],
        worker_tier_adjustments: commission.worker_tier_adjustments || [],
      }); await load();
    } catch (reason) { setError(adminErrorMessage(reason, t('finance.saveCommissionError'), t)); }
    finally { setSaving(false); }
  };

  const saveRewards = async () => {
    setSaving(true); setError('');
    try {
      await adminApi.put(adminApi.endpoints.workerRewardsSettings, {
        trial_min_completed_jobs:Number(rewardForm.trial_min_completed_jobs),
        commission_rate_percent:Number(rewardForm.commission_rate_percent),
        royalty_rate_percent:Number(rewardForm.royalty_rate_percent),
        royalty_min_jobs:Number(rewardForm.royalty_min_jobs),
        royalty_min_completion_rate:Number(rewardForm.royalty_min_completion_rate),
      });
      await load();
    } catch (reason) { setError(adminErrorMessage(reason, t('finance.saveRewardsError'), t)); }
    finally { setSaving(false); }
  };

  if (loading) return <Skeleton rows={9} />;
  const summary = report?.summary || {};
  return <div className="admin-page-stack">
    <div className="admin-metrics-grid">
      <MetricCard label={t('finance.grossVolume')} value={money(summary.gross_volume)} icon={<DollarSign/>} variant="primary"/>
      <MetricCard label={t('finance.platformRevenue')} value={money(summary.platform_revenue)} icon={<Receipt/>} variant="success"/>
      <MetricCard label={t('finance.workerPaid')} value={money(summary.worker_paid)} icon={<WalletCards/>} variant="info"/>
      <MetricCard label={t('finance.openCases')} value={closure?.summary?.open_case_count || cases.filter((item)=>item.case_status==='open').length} icon={<AlertTriangle/>} variant="danger"/>
    </div>
    {error && <div className="admin-inline-error">{error}</div>}
    <div className="admin-tabs">{(['overview','payouts','bonuses','cases','ledger','rules'] as FinanceTab[]).map((item)=><button key={item} className={tab===item?'active':''} onClick={()=>setTab(item)}>{t(`finance.tabs.${item}`)}</button>)}<button onClick={load} aria-label={t('common.refresh')}><RefreshCw size={14}/></button></div>

    {tab==='overview' && <><AdminCard><div className="admin-section-heading"><div><p className="admin-section-title">{t('finance.settlementSummary')}</p><p className="admin-muted">{t('finance.settlementSummaryNote')}</p></div><Banknote/></div><div className="admin-funnel"><div><strong>{money(summary.worker_escrow)}</strong><span>{t('finance.workerEscrow')}</span></div><div><strong>{money(summary.worker_released)}</strong><span>{t('common.released')}</span></div><div><strong>{money(summary.bonus_paid)}</strong><span>{t('finance.bonusPaid')}</span></div><div><strong>{summary.invoice_count||0}</strong><span>{t('finance.invoices')}</span></div></div></AdminCard><AdminCard><p className="admin-section-title">{t('finance.serviceBreakdown')}</p><div className="admin-detail-list">{(report?.service_breakdown||[]).map((item:any)=><div key={item.service_name}><div><strong>{adminServiceName(item.service_name, lang)}</strong><span>{t('finance.invoiceCount', { count: item.invoices })}</span></div><div><strong>{money(item.gross_volume)}</strong><small>{t('finance.revenueAmount', { amount: money(item.platform_revenue) })}</small></div></div>)}</div></AdminCard></>}

    {tab==='payouts' && (workerPayouts.length===0?<EmptyState title={t('finance.noWorkerPayouts')} description={t('finance.noWorkerPayoutsNote')}/>:<><AdminCard><p className="admin-section-title">{t('finance.workerSettlements')}</p><p className="admin-muted">{t('finance.scheduledPaid', { scheduled: money(workerSummary?.scheduled_amount), paid: money(workerSummary?.paid_amount) })}</p></AdminCard><DataTable rows={workerPayouts} rowKey={(item)=>item.id_worker_payout} columns={[{key:'worker',label:t('pros.professional'),render:(item)=><div className="admin-primary-cell"><strong>{item.worker_name}</strong><span>{item.service_name ? adminServiceName(item.service_name, lang) : t('requests.requestTitle',{ id:item.id_request||'-' })}</span></div>},{key:'gross',label:t('finance.gross'),render:(item)=>money(item.gross_amount)},{key:'fee',label:t('finance.fee'),render:(item)=>money(item.platform_fee)},{key:'net',label:t('finance.netPayout'),render:(item)=><strong>{money(item.net_amount)}</strong>},{key:'status',label:t('common.status'),render:(item)=><StatusBadge status={item.payout_status}/>},{key:'action',label:t('common.action'),render:(item)=>item.payout_status==='scheduled'?<button className="admin-button admin-button--small" onClick={()=>setPayoutAction({type:'worker',id:item.id_worker_payout,label:item.worker_name})}>{t('finance.markPaid')}</button>:'-'}]}/></>)}

    {tab==='bonuses' && <><AdminCard><p className="admin-section-title">{t('finance.rewardsProgram')}</p><p className="admin-muted">{t('finance.rewardsProgramNote', { scheduled: money(bonusSummary?.scheduled_amount), paid: money(bonusSummary?.paid_amount) })}</p><FormSection title={t('finance.eligibilityRates')}><label className="admin-field"><span>{t('finance.trialCompletedJobs')}</span><AdminNumberInput min={1} max={100} decimals={0} value={rewardForm.trial_min_completed_jobs} onChange={(v)=>setRewardForm({...rewardForm,trial_min_completed_jobs:v})}/></label><label className="admin-field"><span>{t('finance.commissionBonus')}</span><AdminNumberInput min={0} max={100} decimals={2} value={rewardForm.commission_rate_percent} onChange={(v)=>setRewardForm({...rewardForm,commission_rate_percent:v})}/></label><label className="admin-field"><span>{t('finance.royaltyBonus')}</span><AdminNumberInput min={0} max={100} decimals={2} value={rewardForm.royalty_rate_percent} onChange={(v)=>setRewardForm({...rewardForm,royalty_rate_percent:v})}/></label><label className="admin-field"><span>{t('finance.royaltyMinimumJobs')}</span><AdminNumberInput min={1} max={500} decimals={0} value={rewardForm.royalty_min_jobs} onChange={(v)=>setRewardForm({...rewardForm,royalty_min_jobs:v})}/></label><label className="admin-field"><span>{t('finance.minimumCompletionRate')}</span><AdminNumberInput min={0} max={100} decimals={2} value={rewardForm.royalty_min_completion_rate} onChange={(v)=>setRewardForm({...rewardForm,royalty_min_completion_rate:v})}/></label></FormSection><div className="admin-action-row"><button className="admin-button" disabled={saving||Object.values(rewardForm).some((value)=>value==='')} onClick={saveRewards}>{t('finance.saveRewardsProgram')}</button></div></AdminCard>{bonusPayouts.length===0?<EmptyState title={t('finance.noBonusPayouts')} description={t('finance.noBonusPayoutsNote')}/>:<DataTable rows={bonusPayouts} rowKey={(item)=>item.id_bonus_payout} columns={[{key:'worker',label:t('pros.professional'),render:(item)=><div className="admin-primary-cell"><strong>{item.worker_name}</strong><span>{adminFinanceLabel(item.bonus_type, lang)} · {item.service_name ? adminServiceName(item.service_name, lang) : t('common.general')}</span></div>},{key:'amount',label:t('finance.bonus'),render:(item)=><strong>{money(item.bonus_amount)}</strong>},{key:'date',label:t('finance.scheduled'),render:(item)=>new Date(item.scheduled_for).toLocaleDateString(locale)},{key:'status',label:t('common.status'),render:(item)=><StatusBadge status={item.payout_status}/>},{key:'action',label:t('common.action'),render:(item)=>item.payout_status==='scheduled'?<button className="admin-button admin-button--small" onClick={()=>setPayoutAction({type:'bonus',id:item.id_bonus_payout,label:item.worker_name})}>{t('finance.markPaid')}</button>:'-'}]}/>}</>}

    {tab==='cases' && <><AdminCard><p className="admin-section-title">{t('finance.createCase')}</p><FormSection title={t('finance.caseDetails')}><label className="admin-field"><span>{t('finance.type')}</span><select value={caseForm.case_type} onChange={(e)=>setCaseForm({...caseForm,case_type:e.target.value})}><option value="refund">{adminFinanceLabel('refund', lang)}</option><option value="dispute">{adminFinanceLabel('dispute', lang)}</option><option value="adjustment">{adminFinanceLabel('adjustment', lang)}</option></select></label><label className="admin-field"><span>{t('finance.direction')}</span><select value={caseForm.direction} onChange={(e)=>setCaseForm({...caseForm,direction:e.target.value})}>{['customer_refund','platform_credit','platform_debit','worker_hold','worker_release'].map(v=><option key={v} value={v}>{adminFinanceLabel(v, lang)}</option>)}</select></label><label className="admin-field"><span>{t('finance.requestId')}</span><AdminNumberInput min={1} max={2000000000} decimals={0} value={caseForm.id_request} onChange={(v)=>setCaseForm({...caseForm,id_request:v})}/></label><label className="admin-field"><span>{t('finance.paymentId')}</span><AdminNumberInput min={1} max={2000000000} decimals={0} value={caseForm.id_payment} onChange={(v)=>setCaseForm({...caseForm,id_payment:v})}/></label><label className="admin-field"><span>{t('finance.amount')}</span><AdminNumberInput min={0.01} max={100000} decimals={2} value={caseForm.amount} onChange={(v)=>setCaseForm({...caseForm,amount:v})}/></label><label className="admin-field"><span>{t('common.reason')}</span><input maxLength={255} value={caseForm.reason} onChange={(e)=>setCaseForm({...caseForm,reason:e.target.value})}/></label><label className="admin-field admin-field--wide"><span>{t('finance.notes')}</span><textarea maxLength={2000} value={caseForm.notes} onChange={(e)=>setCaseForm({...caseForm,notes:e.target.value})}/></label></FormSection><button className="admin-button" disabled={saving||!caseForm.amount||!caseForm.reason.trim()} onClick={createCase}>{t('finance.createCase')}</button></AdminCard>{cases.length===0?<EmptyState title={t('finance.noFinanceCases')} description={t('finance.noFinanceCasesNote')}/>:<DataTable rows={cases} rowKey={(item)=>item.id_case} columns={[{key:'case',label:t('finance.case'),render:(item)=><div className="admin-primary-cell"><strong>#{item.id_case} · {adminFinanceLabel(item.case_type, lang)}</strong><span>{item.reason||adminFinanceLabel(item.direction, lang)}</span></div>},{key:'amount',label:t('finance.amount'),render:(item)=>money(item.amount,item.currency_code)},{key:'status',label:t('common.status'),render:(item)=><StatusBadge status={item.case_status}/>},{key:'created',label:t('common.created'),render:(item)=>new Date(item.created_at).toLocaleString(locale)},{key:'action',label:t('common.action'),render:(item)=>item.case_status==='open'?<button className="admin-button admin-button--small" onClick={()=>setResolveTarget(item)}>{t('finance.resolve')}</button>:'-'}]}/>}</>}

    {tab==='ledger' && (ledger.length===0?<EmptyState title={t('finance.noLedgerEntries')} description={t('finance.noLedgerEntriesNote')}/>:<DataTable rows={ledger} rowKey={(item)=>item.id_ledger_entry} columns={[{key:'entry',label:t('finance.entry'),render:(item)=><div className="admin-primary-cell"><strong>{adminFinanceLabel(item.entry_type, lang)}</strong><span>{item.service_name ? adminServiceName(item.service_name, lang) : t('requests.requestTitle', { id: item.id_request || '-' })}</span></div>},{key:'amount',label:t('finance.amount'),render:(item)=><strong>{money(item.amount,item.currency_code)}</strong>},{key:'status',label:t('common.status'),render:(item)=><StatusBadge status={item.entry_status}/>},{key:'date',label:t('common.created'),render:(item)=>new Date(item.created_at).toLocaleString(locale)}]}/>)}

    {tab==='rules' && <AdminCard><div className="admin-section-heading"><div><p className="admin-section-title">{t('finance.commissionEngine')}</p><p className="admin-muted">{t('finance.commissionEngineNote')}</p></div><Scale/></div><FormSection title={t('finance.defaultCommission')}><label className="admin-field"><span>{t('finance.platformRate')}</span><AdminNumberInput min={0} max={50} decimals={2} value={commissionRate} onChange={(v)=>setCommissionRate(v)}/></label><div className="admin-kv"><span>{t('finance.serviceOverrides')}</span><strong>{commission?.service_overrides?.length||0}</strong></div><div className="admin-kv"><span>{t('finance.urgencyRules')}</span><strong>{commission?.urgency_adjustments?.length||0}</strong></div><div className="admin-kv"><span>{t('finance.tierRules')}</span><strong>{commission?.worker_tier_adjustments?.length||0}</strong></div></FormSection><button className="admin-button" disabled={saving} onClick={saveCommission}>{t('finance.saveCommissionRate')}</button></AdminCard>}

    <ConfirmActionDialog open={!!payoutAction} title={t('finance.markPayoutPaid')} description={t('finance.markPayoutPaidDescription', { name: payoutAction?.label || t('pros.professional') })} confirmLabel={t('finance.markPaid')} reason={reason} onReasonChange={setReason} onCancel={()=>{setPayoutAction(null);setReason('')}} onConfirm={markPaid} busy={saving}/>
    <ConfirmActionDialog open={!!resolveTarget} title={t('finance.resolveCase', { id: resolveTarget?.id_case || '' })} description={t('finance.resolveCaseDescription')} confirmLabel={t('finance.resolve')} reason={resolveNotes} onReasonChange={setResolveNotes} onCancel={()=>{setResolveTarget(null);setResolveNotes('')}} onConfirm={confirmResolve} busy={saving}/>
  </div>;
}
