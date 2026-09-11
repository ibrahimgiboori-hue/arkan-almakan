import { externalPayrollSupabaseRepository } from '@/lib/adapters/external-payroll-supabase';
import { salaryBreakdown, uniquePeople } from '@/lib/attendance/external-payroll';

function numberOrNull(value){
  if(value===''||value==null)return null;
  const n=Number(value);
  return Number.isFinite(n)&&n>=0?n:null;
}

export function externalPayrollClientKey(item){
  if(item?.client_entity_id)return `entity:${item.client_entity_id}`;
  return `name:${String(item?.client_name_snapshot||'external-client').trim().toLowerCase().replace(/\s+/g,' ')}`;
}

function safeStoragePart(value){
  return encodeURIComponent(String(value||'client')).replace(/%/g,'_');
}

function now(){return new Date().toISOString();}

export function createExternalPayrollWorkspaceService(repository=externalPayrollSupabaseRepository){
  return Object.freeze({
    async listReadyImports(limit=30){
      return repository.listReadyImports(limit);
    },

    async loadWorkspace(item){
      if(!item?.id)return {days:[],batch:null,profiles:[],lines:[]};
      const days=await repository.loadAttendanceDays(item.id);
      const people=uniquePeople(days);
      const clientKey=externalPayrollClientKey(item);

      let batch=await repository.findBatchByImport(item.id);
      if(!batch){
        const [previous,defaults]=await Promise.all([
          repository.findLatestBatchByClient(clientKey),
          repository.loadDefaults(),
        ]);
        batch=await repository.createBatch({
          attendance_import_id:item.id,
          client_key:clientKey,
          divisor_policy:previous?.divisor_policy||'thirty',
          positive_time_policy:previous?.positive_time_policy||'pay_net',
          include_overtime:previous?.include_overtime??true,
          include_time_shortage:previous?.include_time_shortage??true,
          missing_punch_deduction_days:previous?.missing_punch_deduction_days??defaults?.missing_punch_deduction_days??0.25,
          default_payment_method:previous?.default_payment_method||null,
          client_letterhead_path:previous?.client_letterhead_path||null,
        });
      }

      const keys=people.map((person)=>person.key);
      let profiles=await repository.loadProfiles(clientKey,keys);
      const profileKeys=new Set(profiles.map((profile)=>profile.source_employee_key));
      const missingProfiles=people.filter((person)=>!profileKeys.has(person.key)).map((person)=>({
        client_key:clientKey,
        source_employee_key:person.key,
        source_employee_no:person.no||null,
        source_employee_name:person.name||null,
        display_employee_no:person.no||null,
        display_name:person.name||'غير معروف',
      }));
      if(missingProfiles.length)profiles=[...profiles,...await repository.createProfiles(missingProfiles)];

      let lines=await repository.loadLines(batch.id);
      const lineKeys=new Set(lines.map((line)=>line.source_employee_key));
      const profileByKey=new Map(profiles.map((profile)=>[profile.source_employee_key,profile]));
      const missingLines=people.filter((person)=>!lineKeys.has(person.key)).map((person)=>({
        payroll_batch_id:batch.id,
        external_person_id:person.externalPersonId,
        source_employee_key:person.key,
        payment_method:profileByKey.get(person.key)?.default_payment_method||batch.default_payment_method||null,
      }));
      if(missingLines.length)lines=[...lines,...await repository.createLines(missingLines)];

      return {days,batch,profiles,lines};
    },

    async saveInputs({batch,people,profiles,lines,periodFrom}){
      if(!batch?.id)throw new Error('دفعة الرواتب غير محددة.');
      const profileByKey=new Map((profiles||[]).map((profile)=>[profile.source_employee_key,profile]));
      const lineByKey=new Map((lines||[]).map((line)=>[line.source_employee_key,line]));
      await repository.updateBatch(batch.id,{
        divisor_policy:batch.divisor_policy,
        positive_time_policy:batch.positive_time_policy,
        include_overtime:batch.include_overtime!==false,
        include_time_shortage:batch.include_time_shortage!==false,
        missing_punch_deduction_days:Number(batch.missing_punch_deduction_days||0),
        default_payment_method:batch.default_payment_method||null,
        client_letterhead_path:batch.client_letterhead_path||null,
        status:batch.status==='final'?'final':'draft',
        updated_at:now(),
      },{returning:false});

      for(const person of people||[]){
        const profile=profileByKey.get(person.key);
        const line=lineByKey.get(person.key);
        if(!profile||!line)continue;
        await repository.updateProfile(profile.id,{
          display_employee_no:profile.display_employee_no||null,
          display_name:profile.display_name||profile.source_employee_name||'غير معروف',
          job_title:profile.job_title||null,
          identity_no:profile.identity_no||null,
          default_payment_method:profile.default_payment_method||null,
          nationality_category:profile.nationality_category||null,
          social_insurance_active:!!profile.social_insurance_active,
          social_insurance_scheme:profile.social_insurance_scheme||null,
          updated_at:now(),
        },{returning:false});
        const breakdown=salaryBreakdown({line,profile,periodFrom});
        await repository.updateLine(line.id,{
          reference_net_salary:breakdown.ready?breakdown.referenceNetSalary:null,
          basic_salary:numberOrNull(line.basic_salary),
          housing_allowance:numberOrNull(line.housing_allowance),
          transport_allowance:numberOrNull(line.transport_allowance),
          other_allowances:numberOrNull(line.other_allowances),
          gosi_employee_rate_override:numberOrNull(line.gosi_employee_rate_override),
          manual_additions:Number(line.manual_additions||0),
          manual_additions_reason:line.manual_additions_reason||null,
          manual_deductions:Number(line.manual_deductions||0),
          manual_deductions_reason:line.manual_deductions_reason||null,
          payment_method:line.payment_method||null,
          day_hours_override:numberOrNull(line.day_hours_override),
          show_job_title:!!line.show_job_title,
          show_identity:!!line.show_identity,
          calculated_at:null,
          calculated_final_net_salary:null,
          calculation_snapshot:{},
          updated_at:now(),
        },{returning:false});
      }
      return true;
    },

    async saveProfile({draft,line}){
      if(!draft?.id||!line?.id)throw new Error('بيانات الموظف غير مكتملة.');
      const profile=await repository.updateProfile(draft.id,{
        display_employee_no:String(draft.display_employee_no||'').trim()||null,
        display_name:String(draft.display_name||'').trim(),
        job_title:String(draft.job_title||'').trim()||null,
        identity_no:String(draft.identity_no||'').trim()||null,
        default_payment_method:draft.default_payment_method||null,
        nationality_category:draft.nationality_category||null,
        social_insurance_active:!!draft.social_insurance_active,
        social_insurance_scheme:draft.social_insurance_scheme||null,
        updated_at:now(),
      });
      const payrollLine=await repository.updateLine(line.id,{
        show_job_title:!!draft.show_job_title,
        show_identity:!!draft.show_identity,
        manual_additions:Number(draft.manual_additions||0),
        manual_additions_reason:String(draft.manual_additions_reason||'').trim()||null,
        manual_deductions:Number(draft.manual_deductions||0),
        manual_deductions_reason:String(draft.manual_deductions_reason||'').trim()||null,
        gosi_employee_rate_override:numberOrNull(draft.gosi_employee_rate_override),
        calculated_at:null,
        calculated_final_net_salary:null,
        calculation_snapshot:{},
        updated_at:now(),
      });
      return {profile,line:payrollLine};
    },

    async saveImportedRow({profile,line,profilePatch,linePatch,periodFrom}){
      if(!profile?.id||!line?.id)throw new Error('تعذر مطابقة الموظف مع دفعة الرواتب.');
      const nextProfile={...profile,...profilePatch};
      const nextLine={...line,...linePatch};
      const breakdown=salaryBreakdown({line:nextLine,profile:nextProfile,periodFrom});
      await repository.updateProfile(profile.id,{...profilePatch,updated_at:now()},{returning:false});
      await repository.updateLine(line.id,{
        ...linePatch,
        reference_net_salary:breakdown.ready?breakdown.referenceNetSalary:null,
        calculated_at:null,
        calculated_final_net_salary:null,
        calculation_snapshot:{},
        updated_at:now(),
      },{returning:false});
      return true;
    },

    async uploadLetterhead({batch,file}){
      if(!batch?.id||!file)throw new Error('حدد ملف مطبوعات العميل.');
      const ext=(file.name.split('.').pop()||'png').toLowerCase();
      const path=`external-payroll/${safeStoragePart(batch.client_key)}/letterhead-${Date.now()}.${ext}`;
      await repository.uploadBrandAsset(path,file);
      return repository.updateBatch(batch.id,{client_letterhead_path:path,updated_at:now()});
    },

    async persistCalculation({lineId,calculation}){
      const calc=calculation;
      return repository.updateLine(lineId,{
        reference_net_salary:calc.referenceNetSalary,
        payment_method:calc.paymentMethod,
        calculated_gross_salary:calc.grossSalary,
        calculated_contributory_wage:calc.contributoryWage,
        calculated_gosi_employee_rate:calc.gosiEmployeeRate,
        calculated_gosi_employee_deduction:calc.gosiEmployeeDeduction,
        calculated_divisor_days:calc.divisorDays,
        calculated_day_hours:calc.dayHours,
        calculated_day_value:calc.dayValue,
        calculated_hour_value:calc.hourValue,
        calculated_absence_days:calc.absenceDays,
        calculated_missing_punch_days:calc.missingPunchDays,
        calculated_missing_in_count:calc.missingInCount,
        calculated_missing_out_count:calc.missingOutCount,
        calculated_extra_minutes:calc.extraMinutes,
        calculated_short_minutes:calc.shortMinutes,
        calculated_net_minutes:calc.netMinutes,
        calculated_absence_amount:calc.absenceAmount,
        calculated_missing_punch_amount:calc.missingPunchAmount,
        calculated_time_amount:calc.timeAmount,
        calculated_total_additions:calc.totalAdditions,
        calculated_total_deductions:calc.totalDeductions,
        calculated_final_net_salary:calc.finalNetSalary,
        calculation_snapshot:calc.snapshot,
        calculated_at:now(),
        updated_at:now(),
      });
    },

    async finishCalculation({batchId,incompleteCount=0}){
      return repository.updateBatch(batchId,{status:incompleteCount?'draft':'calculated',updated_at:now()});
    },
  });
}

export const externalPayrollWorkspaceService=createExternalPayrollWorkspaceService();
