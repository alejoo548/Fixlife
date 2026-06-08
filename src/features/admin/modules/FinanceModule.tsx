import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Banknote, DollarSign, Receipt, RefreshCw, Scale, WalletCards } from 'lucide-react';
import { adminApi } from '../api/adminApi';
import { AdminCard, ConfirmActionDialog, DataTable, EmptyState, FormSection, MetricCard, Skeleton, StatusBadge } from '../components/AdminUI';

type FinanceTab = 'overview' | 'payouts' | 'bonuses' | 'cases' | 'ledger' | 'rules';
type LedgerEntry = { id_ledger_entry:number; entry_type:string; amount:number; currency_code:string; entry_status:string; service_name:string|null; id_request:number|null; created_at:string };
type WorkerPayout = { id_worker_payout:number; id_user:number|null; id_request:number|null; worker_name:string; gross_amount:number; platform_fee:number; net_amount:number; payout_status:string; scheduled_for:string; paid_at:string|null; service_name:string|null };
type BonusPayout = { id_bonus_payout:number; id_user:number|null; worker_name:string; bonus_type:string; bonus_amount:number; payout_status:string; scheduled_for:string; paid_at:string|null; service_name:string|null };
type FinanceCase = { id_case:number; case_type:string; case_status:string; direction:string; id_request:number|null; id_payment:number|null; amount:number; currency_code:string; reason:string|null; notes:string|null; created_at:string; resolved_at:string|null };
type RewardForm = { trial_min_completed_jobs:string; commission_rate_percent:string; royalty_rate_percent:string; royalty_min_jobs:string; royalty_min_completion_rate:string };

const money = (value: number, currency = 'USD') => Number(value || 0).toLocaleString('en-US', { style: 'currency', currency });

export default function FinanceModule() {
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
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load finance operations.'); }
    finally { setLoading(false); }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const markPaid = async () => {
    if (!payoutAction) return; setSaving(true);
    try {
      const endpoint = payoutAction.type === 'worker' ? adminApi.endpoints.markWorkerPayoutPaid(payoutAction.id) : adminApi.endpoints.markWorkerBonusPaid(payoutAction.id);
      await adminApi.post(endpoint, { reason }); setPayoutAction(null); setReason(''); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not mark payout as paid.'); }
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
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create finance case.'); }
    finally { setSaving(false); }
  };

  const confirmResolve = async () => {
    if (!resolveTarget || resolveNotes.trim().length < 8) return;
    setSaving(true);
    try {
      await adminApi.post(adminApi.endpoints.resolveFinanceCase(resolveTarget.id_case), { resolution_notes: resolveNotes.trim(), apply_ledger: true });
      setResolveTarget(null); setResolveNotes(''); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not resolve finance case.'); }
    finally { setSaving(false); }
  };

  const saveCommission = async () => {
    if (!commission) return; setSaving(true);
    try {
      await adminApi.put(adminApi.endpoints.commissionRules, {
        global_rate_percent: Number(commissionRate),
        service_overrides: commission.service_overrides || [], urgency_adjustments: commission.urgency_adjustments || [],
        worker_tier_adjustments: commission.worker_tier_adjustments || [], promo_codes: commission.promo_codes || [],
      }); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save commission rules.'); }
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
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save rewards settings.'); }
    finally { setSaving(false); }
  };

  if (loading) return <Skeleton rows={9} />;
  const summary = report?.summary || {};
  return <div className="admin-page-stack">
    <div className="admin-metrics-grid">
      <MetricCard label="Gross volume" value={money(summary.gross_volume)} icon={<DollarSign/>} variant="primary"/>
      <MetricCard label="Platform revenue" value={money(summary.platform_revenue)} icon={<Receipt/>} variant="success"/>
      <MetricCard label="Worker paid" value={money(summary.worker_paid)} icon={<WalletCards/>} variant="info"/>
      <MetricCard label="Open cases" value={closure?.summary?.open_case_count || cases.filter((item)=>item.case_status==='open').length} icon={<AlertTriangle/>} variant="danger"/>
    </div>
    {error && <div className="admin-inline-error">{error}</div>}
    <div className="admin-tabs">{(['overview','payouts','bonuses','cases','ledger','rules'] as FinanceTab[]).map((item)=><button key={item} className={tab===item?'active':''} onClick={()=>setTab(item)}>{item[0].toUpperCase()+item.slice(1)}</button>)}<button onClick={load} aria-label="Refresh"><RefreshCw size={14}/></button></div>

    {tab==='overview' && <><AdminCard><div className="admin-section-heading"><div><p className="admin-section-title">30-day settlement summary</p><p className="admin-muted">Live money movement and reconciliation.</p></div><Banknote/></div><div className="admin-funnel"><div><strong>{money(summary.worker_escrow)}</strong><span>Worker escrow</span></div><div><strong>{money(summary.worker_released)}</strong><span>Released</span></div><div><strong>{money(summary.bonus_paid)}</strong><span>Bonus paid</span></div><div><strong>{summary.invoice_count||0}</strong><span>Invoices</span></div></div></AdminCard><AdminCard><p className="admin-section-title">Service breakdown</p><div className="admin-detail-list">{(report?.service_breakdown||[]).map((item:any)=><div key={item.service_name}><div><strong>{item.service_name}</strong><span>{item.invoices} invoices</span></div><div><strong>{money(item.gross_volume)}</strong><small>{money(item.platform_revenue)} revenue</small></div></div>)}</div></AdminCard></>}

    {tab==='payouts' && (workerPayouts.length===0?<EmptyState title="No worker payouts" description="Scheduled settlements appear here."/>:<><AdminCard><p className="admin-section-title">Worker settlements</p><p className="admin-muted">Scheduled: {money(workerSummary?.scheduled_amount)} · Paid: {money(workerSummary?.paid_amount)}</p></AdminCard><DataTable rows={workerPayouts} rowKey={(item)=>item.id_worker_payout} columns={[{key:'worker',label:'Professional',render:(item)=><div className="admin-primary-cell"><strong>{item.worker_name}</strong><span>{item.service_name||`Request #${item.id_request||'—'}`}</span></div>},{key:'gross',label:'Gross',render:(item)=>money(item.gross_amount)},{key:'fee',label:'Fee',render:(item)=>money(item.platform_fee)},{key:'net',label:'Net payout',render:(item)=><strong>{money(item.net_amount)}</strong>},{key:'status',label:'Status',render:(item)=><StatusBadge status={item.payout_status}/>},{key:'action',label:'Action',render:(item)=>item.payout_status==='scheduled'?<button className="admin-button admin-button--small" onClick={()=>setPayoutAction({type:'worker',id:item.id_worker_payout,label:item.worker_name})}>Mark paid</button>:'—'}]}/></>)}

    {tab==='bonuses' && <><AdminCard><p className="admin-section-title">Rewards program</p><p className="admin-muted">Scheduled bonuses: {money(bonusSummary?.scheduled_amount)} · Paid: {money(bonusSummary?.paid_amount)}. Changes affect future reward calculations; already earned payouts are preserved.</p><FormSection title="Eligibility and rates"><label className="admin-field"><span>Trial completed jobs</span><input type="number" min="1" max="100" value={rewardForm.trial_min_completed_jobs} onChange={(e)=>setRewardForm({...rewardForm,trial_min_completed_jobs:e.target.value})}/></label><label className="admin-field"><span>Commission bonus (%)</span><input type="number" min="0" max="100" step="0.1" value={rewardForm.commission_rate_percent} onChange={(e)=>setRewardForm({...rewardForm,commission_rate_percent:e.target.value})}/></label><label className="admin-field"><span>Royalty bonus (%)</span><input type="number" min="0" max="100" step="0.1" value={rewardForm.royalty_rate_percent} onChange={(e)=>setRewardForm({...rewardForm,royalty_rate_percent:e.target.value})}/></label><label className="admin-field"><span>Royalty minimum jobs</span><input type="number" min="1" max="500" value={rewardForm.royalty_min_jobs} onChange={(e)=>setRewardForm({...rewardForm,royalty_min_jobs:e.target.value})}/></label><label className="admin-field"><span>Minimum completion rate (%)</span><input type="number" min="0" max="100" step="0.1" value={rewardForm.royalty_min_completion_rate} onChange={(e)=>setRewardForm({...rewardForm,royalty_min_completion_rate:e.target.value})}/></label></FormSection><div className="admin-action-row"><button className="admin-button" disabled={saving||Object.values(rewardForm).some((value)=>value==='')} onClick={saveRewards}>Save rewards program</button></div></AdminCard>{bonusPayouts.length===0?<EmptyState title="No bonus payouts" description="Commission and royalty rewards appear here."/>:<DataTable rows={bonusPayouts} rowKey={(item)=>item.id_bonus_payout} columns={[{key:'worker',label:'Professional',render:(item)=><div className="admin-primary-cell"><strong>{item.worker_name}</strong><span>{item.bonus_type} · {item.service_name||'General'}</span></div>},{key:'amount',label:'Bonus',render:(item)=><strong>{money(item.bonus_amount)}</strong>},{key:'date',label:'Scheduled',render:(item)=>new Date(item.scheduled_for).toLocaleDateString()},{key:'status',label:'Status',render:(item)=><StatusBadge status={item.payout_status}/>},{key:'action',label:'Action',render:(item)=>item.payout_status==='scheduled'?<button className="admin-button admin-button--small" onClick={()=>setPayoutAction({type:'bonus',id:item.id_bonus_payout,label:item.worker_name})}>Mark paid</button>:'—'}]}/>}</>}

    {tab==='cases' && <><AdminCard><p className="admin-section-title">Create finance case</p><FormSection title="Case details"><label className="admin-field"><span>Type</span><select value={caseForm.case_type} onChange={(e)=>setCaseForm({...caseForm,case_type:e.target.value})}><option value="refund">Refund</option><option value="dispute">Dispute</option><option value="adjustment">Adjustment</option></select></label><label className="admin-field"><span>Direction</span><select value={caseForm.direction} onChange={(e)=>setCaseForm({...caseForm,direction:e.target.value})}>{['customer_refund','platform_credit','platform_debit','worker_hold','worker_release'].map(v=><option key={v} value={v}>{v.replace(/_/g,' ')}</option>)}</select></label><label className="admin-field"><span>Request ID</span><input value={caseForm.id_request} onChange={(e)=>setCaseForm({...caseForm,id_request:e.target.value})}/></label><label className="admin-field"><span>Payment ID</span><input value={caseForm.id_payment} onChange={(e)=>setCaseForm({...caseForm,id_payment:e.target.value})}/></label><label className="admin-field"><span>Amount</span><input type="number" min="0.01" value={caseForm.amount} onChange={(e)=>setCaseForm({...caseForm,amount:e.target.value})}/></label><label className="admin-field"><span>Reason</span><input value={caseForm.reason} onChange={(e)=>setCaseForm({...caseForm,reason:e.target.value})}/></label><label className="admin-field admin-field--wide"><span>Notes</span><textarea value={caseForm.notes} onChange={(e)=>setCaseForm({...caseForm,notes:e.target.value})}/></label></FormSection><button className="admin-button" disabled={saving||!caseForm.amount||!caseForm.reason.trim()} onClick={createCase}>Create case</button></AdminCard>{cases.length===0?<EmptyState title="No finance cases" description="Refunds, disputes and adjustments appear here."/>:<DataTable rows={cases} rowKey={(item)=>item.id_case} columns={[{key:'case',label:'Case',render:(item)=><div className="admin-primary-cell"><strong>#{item.id_case} · {item.case_type}</strong><span>{item.reason||item.direction}</span></div>},{key:'amount',label:'Amount',render:(item)=>money(item.amount,item.currency_code)},{key:'status',label:'Status',render:(item)=><StatusBadge status={item.case_status}/>},{key:'created',label:'Created',render:(item)=>new Date(item.created_at).toLocaleString()},{key:'action',label:'Action',render:(item)=>item.case_status==='open'?<button className="admin-button admin-button--small" onClick={()=>setResolveTarget(item)}>Resolve</button>:'—'}]}/>}</>}

    {tab==='ledger' && (ledger.length===0?<EmptyState title="No ledger entries" description="Financial activity appears after payments."/>:<DataTable rows={ledger} rowKey={(item)=>item.id_ledger_entry} columns={[{key:'entry',label:'Entry',render:(item)=><div className="admin-primary-cell"><strong>{item.entry_type.replace(/_/g,' ')}</strong><span>{item.service_name||`Request #${item.id_request||'—'}`}</span></div>},{key:'amount',label:'Amount',render:(item)=><strong>{money(item.amount,item.currency_code)}</strong>},{key:'status',label:'Status',render:(item)=><StatusBadge status={item.entry_status}/>},{key:'date',label:'Created',render:(item)=>new Date(item.created_at).toLocaleString()}]}/>)}

    {tab==='rules' && <AdminCard><div className="admin-section-heading"><div><p className="admin-section-title">Commission engine</p><p className="admin-muted">Default rate plus existing service, urgency, tier and promo overrides.</p></div><Scale/></div><FormSection title="Default commission"><label className="admin-field"><span>Platform rate (%)</span><input type="number" min="0" max="50" step="0.1" value={commissionRate} onChange={(e)=>setCommissionRate(e.target.value)}/></label><div className="admin-kv"><span>Service overrides</span><strong>{commission?.service_overrides?.length||0}</strong></div><div className="admin-kv"><span>Urgency rules</span><strong>{commission?.urgency_adjustments?.length||0}</strong></div><div className="admin-kv"><span>Tier rules</span><strong>{commission?.worker_tier_adjustments?.length||0}</strong></div></FormSection><button className="admin-button" disabled={saving} onClick={saveCommission}>Save commission rate</button></AdminCard>}

    <ConfirmActionDialog open={!!payoutAction} title="Mark payout as paid" description={`Confirm funds were sent to ${payoutAction?.label || 'professional'}. This creates ledger and audit records.`} confirmLabel="Mark as paid" reason={reason} onReasonChange={setReason} onCancel={()=>{setPayoutAction(null);setReason('')}} onConfirm={markPaid} busy={saving}/>
    <ConfirmActionDialog open={!!resolveTarget} title={`Resolve case #${resolveTarget?.id_case || ''}`} description="Resolving creates a ledger entry and closes the case. This cannot be undone." confirmLabel="Resolve case" reason={resolveNotes} onReasonChange={setResolveNotes} onCancel={()=>{setResolveTarget(null);setResolveNotes('')}} onConfirm={confirmResolve} busy={saving}/>
  </div>;
}
