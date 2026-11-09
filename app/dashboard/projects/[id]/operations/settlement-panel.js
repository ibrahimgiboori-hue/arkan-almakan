'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { projectSettlementService } from '@/lib/application/project-settlement-service';
import {
  SETTLEMENT_BASIS_LABELS,
  buildSettlementStatement,
  SETTLEMENT_STATUS_LABELS,
  defaultSettlementBasis,
  savedSettlementLines,
  settlementDayValue,
  settlementNextStep,
} from '@/lib/project-settlement.mjs';
import { todayIsoInRiyadh } from '@/lib/format';
import RawGrid from '@/components/ui/RawGrid';
import styles from './operations.module.css';

const money = (value) => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dayText = (value) => { if (!value) return '—'; const [y, m, d] = String(value).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
const signed = (line) => `${line.sign < 0 ? '−' : '+'} ${money(line.amount)}`;

const PAYER = { contractor: 'دفعه المقاول', arkan_custody: 'من عهدة أركان', arkan_direct: 'من أركان مباشرة', employee: 'من موظف' };
const CHARGE = { arkan: 'على أركان', owner: 'على المالك', contractor: 'على المقاول' };

function StatementTable({ lines, net, caption }) {
  return (
    <table className={styles.statementTable} data-settlement-statement="true">
      {caption ? <caption>{caption}</caption> : null}
      <tbody>
        {lines.filter((line) => line.amount || line.key === 'works').map((line) => (
          <tr key={line.key} data-sign={line.sign < 0 ? 'minus' : 'plus'} data-not-deducted={line.notDeducted ? 'true' : undefined}>
            <th scope="row">{line.label}{line.note ? <small>{line.note}</small> : null}{line.notDeducted ? <small>غير مخصومة بعد</small> : null}</th>
            <td>{signed(line)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot><tr><th scope="row">الصافي المستحق للمقاول</th><td>{money(net)} ر.س</td></tr></tfoot>
    </table>
  );
}

/**
 * كشف تسوية المقاول: المقاول والفترة من الفلترة المشتركة، والكشف يُجمع تلقائيًا من سجلات المشروع
 * (الحضور والإنجاز، المصروفات، الدفعات، السلف). الحفظ يفتح معاملة مالية، ودورة الاعتماد
 * (المحاسب ← تعميد المدير ← الصرف من الخزينة) تتم من هنا نفسه — مدخل واحد للتسوية.
 */
export default function SettlementPanel({ projectId, contractors = [], contractorId = '', from, to, service = projectSettlementService }) {
  const contractor = contractors.find((item) => item.id === contractorId) || null;
  const [basis, setBasis] = useState(() => defaultSettlementBasis(contractor?.project_basis));
  const [penalty, setPenalty] = useState('');
  const [other, setOther] = useState('');
  const [period, setPeriod] = useState(null);
  const [settlements, setSettlements] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [payForm, setPayForm] = useState({ accountId: '', date: todayIsoInRiyadh(), reference: '' });
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [feedback, setFeedback] = useState(null);
  const seqRef = useRef(0);

  useEffect(() => { setBasis(defaultSettlementBasis(contractor?.project_basis)); }, [contractor?.id, contractor?.project_basis]);

  const load = useCallback(async () => {
    if (!projectId) return;
    const seq = ++seqRef.current;
    setLoading(true);
    try {
      const [list, periodData] = await Promise.all([
        service.loadSettlements({ projectId, contractorId }),
        contractorId ? service.loadPeriod({ projectId, contractorId, from, to, basis }) : Promise.resolve(null),
      ]);
      if (seq !== seqRef.current) return;
      setSettlements(list);
      setPeriod(periodData);
    } catch (error) {
      if (seq !== seqRef.current) return;
      setPeriod(null);
      setFeedback({ type: 'error', text: 'تعذر تجهيز كشف التسوية: ' + (error.message || error) });
    }
    if (seq === seqRef.current) setLoading(false);
  }, [projectId, contractorId, from, to, basis, service]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setFeedback(null); }, [projectId, contractorId, from, to]);
  useEffect(() => {
    service.loadTreasuryAccounts().then(setAccounts).catch(() => setAccounts([]));
  }, [service]);

  const contractorName = useMemo(() => {
    const byId = new Map(contractors.map((item) => [item.id, item.operation_alias || item.name_ar]));
    return (id) => byId.get(id) || '—';
  }, [contractors]);
  const samePeriod = settlements.find((row) => row.contractor_id === contractorId && row.period_from === from && row.period_to === to && !['cancelled', 'rejected'].includes(row.status));
  // Deductions and additions only change the statement on screen; the database recomputes it on save.
  const statement = useMemo(() => (period ? buildSettlementStatement(period.preview, {
    penalty, other, openAdvances: period.openAdvances, periodPayments: period.periodPayments, basis,
  }) : null), [period, penalty, other, basis]);

  async function run(key, task, success) {
    setBusy(key);
    setFeedback(null);
    try {
      await task();
      setFeedback({ type: 'success', text: success });
      setNote('');
      await load();
    } catch (error) {
      setFeedback({ type: 'error', text: error.message || String(error) });
    }
    setBusy('');
  }

  const save = () => run('save', () => service.save({ projectId, contractorId, from, to, basis, penalty, other, settlementId: samePeriod?.id || null, statement }),
    samePeriod ? `أُعيد حساب التسوية ${samePeriod.settlement_no} وأُرسلت للمراجعة المالية.` : 'حُفظت التسوية وأُرسلت للمحاسب للاعتماد.');
  const recalc = (row) => run(`recalc-${row.id}`, () => service.save({ projectId, contractorId: row.contractor_id, from: row.period_from, to: row.period_to, basis, penalty: row.penalty_amount, other: row.other_additions, settlementId: row.id }),
    `أُعيد حساب التسوية ${row.settlement_no} بأحدث بيانات الفترة.`);
  const act = (row, action, done) => run(`${action}-${row.id}`, () => service.act({ settlement: row, action, note }), done);
  const pay = (row) => run(`pay-${row.id}`, () => service.pay({ settlement: row, accountId: payForm.accountId, paymentDate: payForm.date, reference: payForm.reference }),
    `صُرفت التسوية ${row.settlement_no} من الخزينة.`);

  const dayColumns = [
    { key: '_d', label: 'التاريخ', type: 'computed', compute: (row) => dayText(row.work_date) },
    { key: '_p', label: 'الحاضرون', type: 'computed', numeric: true, compute: (row) => Number(row.present_count || 0) },
    { key: '_dw', label: 'قيمة اليوميات', type: 'computed', numeric: true, total: 'sum', compute: (row) => Number(row.daywork_value || 0), format: money },
    { key: '_pw', label: 'قيمة المقطوعية', type: 'computed', numeric: true, total: 'sum', compute: (row) => Number(row.piecework_value || 0), format: money },
    { key: '_v', label: 'المحسوب في التسوية', type: 'computed', numeric: true, total: 'sum', compute: (row) => settlementDayValue(row, basis), format: money },
  ];
  const expenseColumns = [
    { key: '_d', label: 'التاريخ', type: 'computed', compute: (row) => dayText(row.expense_date) },
    { key: '_c', label: 'التصنيف', type: 'computed', compute: (row) => row.category || '—' },
    { key: '_n', label: 'البيان', type: 'computed', compute: (row) => row.notes || '—' },
    { key: '_w', label: 'الدافع / على من', type: 'computed', compute: (row) => `${PAYER[row.payer] || row.payer} · ${CHARGE[row.charge_to] || row.charge_to}` },
    { key: '_plus', label: 'يُضاف له', type: 'computed', numeric: true, total: 'sum', compute: (row) => Number(row.reimbursable || 0) || null, format: (value) => (value ? money(value) : null) },
    { key: '_minus', label: 'يُخصم منه', type: 'computed', numeric: true, total: 'sum', compute: (row) => Number(row.charged || 0) || null, format: (value) => (value ? money(value) : null) },
  ];
  const paymentColumns = [
    { key: '_d', label: 'التاريخ', type: 'computed', compute: (row) => dayText(row.payment_date) },
    { key: '_a', label: 'المبلغ', type: 'computed', numeric: true, total: 'sum', compute: (row) => Number(row.amount || 0), format: money },
    { key: '_s', label: 'الطريقة / المرجع', type: 'computed', compute: (row) => [row.source === 'cash' ? 'نقدًا' : row.source === 'custody' ? 'من عهدة' : 'تحويل', row.reference].filter(Boolean).join(' · ') },
    { key: '_n', label: 'ملاحظة', type: 'computed', compute: (row) => row.notes || null },
  ];
  const advanceColumns = [
    { key: '_d', label: 'تاريخ السلفة', type: 'computed', compute: (row) => dayText(row.advance_date) },
    { key: '_a', label: 'قيمتها', type: 'computed', numeric: true, compute: (row) => Number(row.amount || 0), format: money },
    { key: '_r', label: 'المتبقي منها', type: 'computed', numeric: true, total: 'sum', compute: (row) => Number(row.remaining || 0), format: money },
    { key: '_n', label: 'ملاحظة', type: 'computed', compute: (row) => row.notes || null },
  ];

  return (
    <section style={{ width: '100%', minWidth: 0 }} data-settlement-panel="project">
      <main className={styles.formPane} style={{ width: '100%', minWidth: 0, paddingInline: 0 }}>
        <div className={styles.panelTitle}>
          <div>
            <span>CONTRACTOR SETTLEMENT</span>
            <h2>تسوية المقاول</h2>
            <p>اختر المقاول والفترة من الفلترة، والكشف يُجمع تلقائيًا من سجلات المشروع. الحفظ يرسل التسوية للمحاسب، ثم تعميد المدير، ثم الصرف من الخزينة — كله من هنا.</p>
          </div>
        </div>

        {feedback && <div className={feedback.type === 'error' ? styles.panelError : styles.panelSuccess}>{feedback.text}</div>}

        {!contractorId ? (
          <div className={styles.panelEmpty}>اختر المقاول من الفلترة أعلاه لعرض كشف تسويته عن الفترة.</div>
        ) : (
          <>
            <section className={styles.settlementControls} aria-label="إعداد الكشف">
              <label><span>طريقة الحساب</span>
                <select value={basis} onChange={(event) => setBasis(event.target.value)}>
                  {Object.entries(SETTLEMENT_BASIS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label><span>خصومات وغرامات</span><input type="number" min="0" step="0.01" value={penalty} onChange={(event) => setPenalty(event.target.value)} placeholder="0.00" /></label>
              <label><span>إضافات أخرى</span><input type="number" min="0" step="0.01" value={other} onChange={(event) => setOther(event.target.value)} placeholder="0.00" /></label>
            </section>

            {loading && !period ? <div className={styles.loading}>جارٍ تجميع الكشف…</div> : statement ? (
              <>
                <StatementTable lines={statement.lines} net={statement.net} caption={`${contractor?.name_ar || ''} · من ${dayText(from)} إلى ${dayText(to)}`} />
                {statement.warnings.map((warning) => <div key={warning} className={styles.panelError}>{warning}</div>)}
                <div className={styles.settlementActions}>
                  <button type="button" className={styles.primaryAction} onClick={save} disabled={Boolean(busy) || !statement.canSave}>
                    {busy === 'save' ? 'جارٍ الحفظ…' : samePeriod ? `إعادة حساب التسوية ${samePeriod.settlement_no}` : 'حفظ التسوية وإرسالها للمحاسب'}
                  </button>
                  {!statement.canSave && !statement.warnings.length ? <small>لا توجد أعمال أو حركات لهذا المقاول في الفترة.</small> : null}
                </div>

                <h3 className={styles.settlementHeading}>أيام العمل</h3>
                <RawGrid columns={dayColumns} rows={period.days} rowKey={(row) => row.work_date} rowDisabled={() => true} totalsLabel="الإجمالي" emptyMessage="لا حضور ولا إنجاز مسجل لهذا المقاول في الفترة." />
                <h3 className={styles.settlementHeading}>المصروفات التي تخص حسابه</h3>
                <RawGrid columns={expenseColumns} rows={period.expenses} rowKey={(row) => `${row.source}-${row.source_id}`} rowDisabled={() => true} totalsLabel="الإجمالي" emptyMessage="لا مصروفات تخص حساب المقاول في الفترة." />
                <h3 className={styles.settlementHeading}>الدفعات المباشرة في الفترة</h3>
                <RawGrid columns={paymentColumns} rows={period.payments} rowKey={(row) => row.id} rowDisabled={() => true} totalsLabel="الإجمالي" emptyMessage="لا دفعات مباشرة في الفترة." />
                <h3 className={styles.settlementHeading}>السلف المفتوحة</h3>
                <RawGrid columns={advanceColumns} rows={period.advances} rowKey={(row) => row.id} rowDisabled={() => true} totalsLabel="الإجمالي" emptyMessage="لا سلف مفتوحة على المقاول." />
              </>
            ) : null}
          </>
        )}

        <h3 className={styles.settlementHeading}>التسويات المحفوظة{contractor ? ` — ${contractor.name_ar}` : ' — كل المقاولين'}</h3>
        {settlements.length ? (
          <>
            <label className={styles.settlementNote}><span>ملاحظة الإجراء (مطلوبة للإرجاع والإلغاء)</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="مثال: أعد الحساب بعد تصحيح حضور يوم الإثنين" /></label>
            <div className={styles.settlementList}>
              {settlements.map((row) => {
                const step = settlementNextStep(row, row.financial_case?.status);
                const lines = savedSettlementLines(row);
                return (
                  <article key={row.id} className={styles.settlementCard} data-settlement-status={row.status}>
                    <header>
                      <strong>{row.settlement_no}</strong>
                      <span>{contractorName(row.contractor_id)} · {dayText(row.period_from)} — {dayText(row.period_to)}</span>
                      <b>{money(row.net_payable)} ر.س</b>
                    </header>
                    <p>{step.key === 'paid' ? 'صُرفت' : (SETTLEMENT_STATUS_LABELS[row.status] || row.status)}{row.financial_case?.case_no ? ` · المعاملة ${row.financial_case.case_no}` : ''}{step.key === 'paid' || step.key === 'closed' ? '' : ` · الخطوة التالية: ${step.label}`}</p>
                    <StatementTable lines={lines} net={row.net_payable} />
                    <div className={styles.settlementActions}>
                      <Link href={`/print/settlement/${row.id}`} target="_blank" rel="noopener noreferrer">طباعة الكشف</Link>
                      {(step.key === 'finance_approve' || step.key === 'fix') && <button type="button" onClick={() => recalc(row)} disabled={Boolean(busy)}>إعادة الحساب</button>}
                      {step.key === 'finance_approve' && <button type="button" className={styles.primaryAction} onClick={() => act(row, 'finance_approve', `اعتمد المحاسب التسوية ${row.settlement_no} وأُرسلت لتعميد المدير.`)} disabled={Boolean(busy)}>اعتماد المحاسب</button>}
                      {step.key === 'final_approve' && <button type="button" className={styles.primaryAction} onClick={() => act(row, 'final_approve', `عُمّدت التسوية ${row.settlement_no} وأصبحت جاهزة للصرف.`)} disabled={Boolean(busy)}>تعميد المدير التنفيذي</button>}
                      {(step.key === 'finance_approve' || step.key === 'final_approve') && <button type="button" onClick={() => act(row, 'return_to_source', `أُعيدت التسوية ${row.settlement_no} للتصحيح.`)} disabled={Boolean(busy)}>إرجاع للتصحيح</button>}
                      {['finance_approve', 'final_approve', 'fix'].includes(step.key) && <button type="button" onClick={() => act(row, 'cancel', `أُلغيت التسوية ${row.settlement_no} وعادت حركاتها مفتوحة.`)} disabled={Boolean(busy)}>إلغاء</button>}
                    </div>
                    {step.key === 'pay' && (
                      <div className={styles.settlementPay}>
                        <label><span>من حساب</span>
                          <select value={payForm.accountId} onChange={(event) => setPayForm((form) => ({ ...form, accountId: event.target.value }))}>
                            <option value="">اختر حساب الخزينة</option>
                            {accounts.map((account) => <option key={account.id} value={account.id}>{account.account_code} — {account.name_ar} ({money(account.current_balance)})</option>)}
                          </select>
                        </label>
                        <label><span>تاريخ الصرف</span><input type="date" value={payForm.date} onChange={(event) => setPayForm((form) => ({ ...form, date: event.target.value }))} /></label>
                        <label><span>المرجع</span><input value={payForm.reference} onChange={(event) => setPayForm((form) => ({ ...form, reference: event.target.value }))} placeholder="رقم التحويل أو الشيك" /></label>
                        <button type="button" className={styles.primaryAction} onClick={() => pay(row)} disabled={Boolean(busy)}>صرف {money(row.net_payable)} ر.س</button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </>
        ) : <div className={styles.panelEmpty}>لا توجد تسويات محفوظة{contractor ? ' لهذا المقاول' : ''} في المشروع بعد.</div>}
      </main>
    </section>
  );
}
