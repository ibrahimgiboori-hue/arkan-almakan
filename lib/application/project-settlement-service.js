import { projectSettlementSupabaseRepository } from '@/lib/adapters/project-settlement-supabase';
import { buildSettlementStatement, openAdvanceTotal, settlementExpenseRows } from '@/lib/project-settlement.mjs';
import { projectLedgerRangeProblem } from '@/lib/project-operation-context.mjs';

const MAX_SETTLEMENT_DAYS = 92;

/**
 * تسوية المقاول: كشف الفترة، الحفظ (يفتح معاملة مالية)، ثم دورة الاعتماد والصرف من نفس الشاشة.
 * القاعدة هي سلطة المبلغ: الحفظ والاعتماد والصرف كلها دوال قاعدة تفحص الصلاحية بنفسها.
 */
export function createProjectSettlementService(repository = projectSettlementSupabaseRepository) {
  return Object.freeze({
    async loadPeriod({ projectId, contractorId, from, to, basis = 'item', penalty = 0, other = 0 }) {
      if (!projectId || !contractorId) throw new Error('اختر المقاول من الفلترة لعرض كشف تسويته.');
      const problem = projectLedgerRangeProblem(from, to, MAX_SETTLEMENT_DAYS);
      if (problem) throw new Error(problem);
      const source = await repository.loadPeriod({ projectId, contractorId, from, to, basis });
      const openAdvances = openAdvanceTotal(source.advances);
      const periodPayments = (source.payments || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
      return Object.freeze({
        ...source,
        expenses: settlementExpenseRows(source.expenses),
        openAdvances,
        periodPayments,
        statement: buildSettlementStatement(source.preview, { penalty, other, openAdvances, periodPayments, basis }),
      });
    },

    loadSettlements({ projectId, contractorId = '' }) {
      if (!projectId) return Promise.resolve([]);
      return repository.loadSettlements({ projectId, contractorId });
    },

    loadTreasuryAccounts() {
      return repository.loadTreasuryAccounts();
    },

    async save({ projectId, contractorId, from, to, basis, penalty = 0, other = 0, settlementId = null, statement }) {
      if (statement && !statement.canSave) throw new Error(statement.warnings[0] || 'لا يوجد ما يُسوّى في هذه الفترة.');
      return repository.build({
        projectId, contractorId, from, to, basis,
        penalty: Math.max(0, Number(penalty) || 0),
        other: Math.max(0, Number(other) || 0),
        settlementId,
      });
    },

    async act({ settlement, action, note = '' }) {
      if (!settlement?.case_id) throw new Error('هذه التسوية بلا معاملة مالية؛ أعد حسابها ثم احفظها.');
      if ((action === 'return_to_source' || action === 'cancel') && !String(note || '').trim()) {
        throw new Error(action === 'cancel' ? 'اكتب سبب الإلغاء.' : 'اكتب سبب الإرجاع للتصحيح.');
      }
      return repository.act({ caseId: settlement.case_id, action, note: String(note || '').trim() || null });
    },

    async pay({ settlement, accountId, paymentDate, reference = '' }) {
      if (!settlement?.case_id) throw new Error('هذه التسوية بلا معاملة مالية.');
      if (!accountId) throw new Error('اختر حساب الخزينة الذي يُصرف منه.');
      if (!paymentDate) throw new Error('اكتب تاريخ الصرف.');
      return repository.pay({ caseId: settlement.case_id, accountId, paymentDate, reference: String(reference || '').trim() || null });
    },

    loadForPrint(settlementId) {
      return repository.loadForPrint(settlementId);
    },
  });
}

export const projectSettlementService = createProjectSettlementService();
