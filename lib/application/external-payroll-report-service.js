'use client';

import { externalPayrollReportSupabaseRepository } from '@/lib/adapters/external-payroll-report-supabase';
import { buildExternalPayrollReport } from '@/lib/attendance/external-payroll-report';

export function createExternalPayrollReportService(repository=externalPayrollReportSupabaseRepository){
  return Object.freeze({
    async findRunByImport(importId){
      return repository.findRunByImport(importId);
    },
    async loadRun(batchId){
      const source=await repository.loadRunSource(batchId);
      const report=buildExternalPayrollReport(source);
      return Object.freeze({source,report});
    },
  });
}

export const externalPayrollReportService=createExternalPayrollReportService();
