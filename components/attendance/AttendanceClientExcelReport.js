'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

const STATUS_AR={complete:'حضور كامل',missing_in:'دخول مفقود',missing_out:'خروج مفقود',absent:'غياب',day_off:'إجازة',no_schedule:'دوام غير محدد',needs_review:'للمراجعة'};
const DECISION_AR={accepted:'مقبول',rejected:'مرفوض',pending:'بانتظار العميل'};
const JUSTIFICATION_AR={sick_leave:'إجازة مرضية',approved_leave:'إجازة معتمدة',non_working_day:'يوم غير مجدول',outside_work:'مهمة خارجية',biometric_device_issue:'عطل جهاز البصمة',forgot_punch:'نسيان البصمة',approved_shift_change:'تعديل دوام معتمد',approved_late_early_permission:'إذن تأخير / خروج',training_meeting_assignment:'تكليف / تدريب / اجتماع',other_site_branch:'عمل في موقع آخر',other:'أخرى'};
const C={navy:'FF24364B',ink:'FF1F2933',muted:'FF66788A',line:'FFD9E1E8',soft:'FFF6F8FA',green:'FFEAF5EE',amber:'FFFFF6DF',red:'FFFBEAEC',white:'FFFFFFFF'};

function minutesBetween(start,end){
  if(!start||!end)return 0;
  const a=new Date(String(start).replace(' ','T'));const b=new Date(String(end).replace(' ','T'));
  if(Number.isNaN(a.getTime())||Number.isNaN(b.getTime()))return 0;
  return Math.max(0,Math.round((b-a)/60000));
}
function hhmm(minutes){
  if(minutes===null||minutes===undefined||Number.isNaN(Number(minutes)))return '—';
  const n=Math.max(0,Math.round(Number(minutes)));return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;
}
function clock(value){
  if(!value)return '—';const s=String(value).replace('T',' ');const m=s.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);return m?`${String(m[1]).padStart(2,'0')}:${m[2]}`:s;
}
function dateOnly(value){return value?String(value).slice(0,10):'—';}
function dedupePunches(list){
  const sorted=[...list].filter(Boolean).sort((a,b)=>new Date(a)-new Date(b));const out=[];
  for(const value of sorted){const current=new Date(value);const previous=out.length?new Date(out[out.length-1]):null;if(!previous||Number.isNaN(previous.getTime())||Number.isNaN(current.getTime())||(current-previous)>60000)out.push(value);}return out;
}
function subjectKey(day){return day.external_person_id||day.employee_id||`${day.subject_no||''}|${day.subject_name||''}`;}
function punchKey(punch){return punch.external_person_id||punch.employee_id||`${punch.external_employee_no||''}|${punch.external_employee_name||''}`;}
function styleHeader(row){
  row.height=25;row.eachCell((cell)=>{cell.font={bold:true,color:{argb:C.white},size:10};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:C.navy}};cell.alignment={vertical:'middle',horizontal:'center',wrapText:true};cell.border={top:{style:'thin',color:{argb:C.navy}},bottom:{style:'thin',color:{argb:C.navy}},left:{style:'thin',color:{argb:C.white}},right:{style:'thin',color:{argb:C.white}}};});
}
function styleBody(sheet,start,end,count){
  for(let r=start;r<=end;r++){const row=sheet.getRow(r);row.height=21;for(let c=1;c<=count;c++){const cell=row.getCell(c);cell.font={color:{argb:C.ink},size:9.5};cell.alignment={vertical:'middle',horizontal:c<=2?'right':'center',wrapText:true};cell.border={top:{style:'hair',color:{argb:C.line}},bottom:{style:'hair',color:{argb:C.line}},left:{style:'hair',color:{argb:C.line}},right:{style:'hair',color:{argb:C.line}}};if(r%2===0)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:C.soft}};}}
}
function addTitle(sheet,title,subtitle,count){
  sheet.mergeCells(1,1,1,count);const t=sheet.getCell(1,1);t.value=title;t.font={bold:true,size:15,color:{argb:C.navy}};t.alignment={horizontal:'right',vertical:'middle'};sheet.getRow(1).height=27;
  sheet.mergeCells(2,1,2,count);const s=sheet.getCell(2,1);s.value=subtitle;s.font={size:10,color:{argb:C.muted}};s.alignment={horizontal:'right',vertical:'middle'};sheet.getRow(2).height=22;
}
function statusFill(cell,status){
  let color=C.soft;if(status==='complete'||status==='day_off')color=C.green;if(status==='missing_in'||status==='missing_out'||status==='needs_review')color=C.amber;if(status==='absent')color=C.red;cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:color}};cell.font={bold:true,color:{argb:C.ink},size:9.5};
}
function setup(sheet,headerRow,lastColumn){
  sheet.views=[{state:'frozen',ySplit:headerRow,rightToLeft:true}];sheet.autoFilter={from:{row:headerRow,column:1},to:{row:headerRow,column:lastColumn}};sheet.properties.defaultRowHeight=21;sheet.pageSetup={orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,paperSize:9};sheet.headerFooter.oddFooter='&Rصفحة &P من &N';
}

export default function AttendanceClientExcelReport({activeImport,disabled=false}){
  const [busy,setBusy]=useState(false);const [err,setErr]=useState('');

  async function exportReport(){
    if(!activeImport?.id)return;setBusy(true);setErr('');
    try{
      const [{default:ExcelJS},dayQ,punchQ]=await Promise.all([
        import('exceljs'),
        supabase.from('v_hr_attendance_processing_days').select('*').eq('import_id',activeImport.id).order('subject_no').order('subject_name').order('work_date'),
        supabase.from('hr_attendance_punches').select('employee_id,external_person_id,external_employee_no,external_employee_name,punch_local,punch_date').eq('import_id',activeImport.id).order('punch_local'),
      ]);
      if(dayQ.error)throw dayQ.error;if(punchQ.error)throw punchQ.error;
      const days=dayQ.data||[];const punches=punchQ.data||[];if(!days.length)throw new Error('لا توجد نتائج لهذه الدفعة.');
      if(activeImport.processing_scope==='external'){
        const unresolved=days.filter((d)=>['absent','missing_in','missing_out','needs_review'].includes(d.day_status)&&!d.justification_id).length;
        const pending=days.filter((d)=>d.justification_id&&String(d.justification_decision||'pending')==='pending').length;
        if(unresolved||pending)throw new Error(`التقرير غير جاهز: ${unresolved} غير مبررة، ${pending} بانتظار العميل.`);
      }

      const punchMap=new Map();for(const p of punches){const key=`${punchKey(p)}|${p.punch_date}`;if(!punchMap.has(key))punchMap.set(key,[]);punchMap.get(key).push(p.punch_local);}
      const wb=new ExcelJS.Workbook();wb.creator='Arkan Al-Makan';wb.created=new Date();wb.modified=new Date();wb.company=activeImport.client_name_snapshot||'';
      const client=activeImport.client_name_snapshot||(activeImport.processing_scope==='internal'?'أركان المكان':'العميل');const period=`${activeImport.period_from||'—'} إلى ${activeImport.period_to||'—'}`;const subtitle=`${client} — ${period}`;

      const daily=wb.addWorksheet('1- الحضور اليومي',{views:[{rightToLeft:true}]});
      const dailyHeaders=['الرقم','الموظف','التاريخ','حركات البصمة','الدوام','الدخول','الخروج','ساعات العمل','ساعات الدوام','الحالة','التأخير','الخروج المبكر','الوقت الزائد','الخصم الأولي','ملاحظة'];
      addTitle(daily,'الحضور اليومي',subtitle,dailyHeaders.length);daily.addRow([]);const dailyHeader=daily.addRow(dailyHeaders);styleHeader(dailyHeader);const dailyStart=dailyHeader.number+1;
      for(const d of days){
        const raw=dedupePunches(punchMap.get(`${subjectKey(d)}|${d.work_date}`)||[]);const scheduled=d.scheduled_start&&d.scheduled_end?`${clock(d.scheduled_start)}–${clock(d.scheduled_end)}`:'—';const scheduledMinutes=minutesBetween(d.scheduled_start,d.scheduled_end);const late=Math.max(0,Number(d.late_arrival_minutes??d.arrival_delta_minutes??0));const early=Math.max(0,Number(d.early_departure_minutes??(Number(d.departure_delta_minutes||0)<0?-Number(d.departure_delta_minutes||0):0)));const extra=Math.max(0,Number(d.late_departure_minutes??d.departure_delta_minutes??0));
        const row=daily.addRow([d.subject_no||'',d.subject_name||'',dateOnly(d.work_date),raw.map(clock).join(' | ')||'—',scheduled,clock(d.check_in),clock(d.check_out),d.worked_minutes==null?'—':hhmm(d.worked_minutes),scheduledMinutes?hhmm(scheduledMinutes):'—',STATUS_AR[d.day_status]||d.day_status||'—',late?hhmm(late):'0:00',early?hhmm(early):'0:00',extra?hhmm(extra):'0:00',Number(d.preliminary_deduction_days||0),d.analysis_note||'']);statusFill(row.getCell(10),d.day_status);
      }
      styleBody(daily,dailyStart,daily.lastRow.number,dailyHeaders.length);daily.columns=[11,23,12,30,16,12,12,15,15,18,11,13,13,12,34].map((width)=>({width}));setup(daily,dailyHeader.number,dailyHeaders.length);

      const review=wb.addWorksheet('2- التبريرات',{views:[{rightToLeft:true}]});
      const reviewHeaders=['الرقم','الموظف','التاريخ','الحالة','التبرير','التفاصيل','المرجع','قرار العميل','ملاحظة','الخصم الأولي','الخصم النهائي','النتيجة'];
      addTitle(review,'التبريرات',subtitle,reviewHeaders.length);review.addRow([]);const reviewHeader=review.addRow(reviewHeaders);styleHeader(reviewHeader);const reviewStart=reviewHeader.number+1;
      const reviewDays=days.filter((d)=>['absent','missing_in','missing_out','needs_review'].includes(d.day_status)||d.justification_id||Number(d.preliminary_deduction_days||0)>0);
      for(const d of reviewDays){
        const dec=d.justification_decision||(d.justification_id?'pending':'none');const result=dec==='accepted'?'تبرير مقبول':dec==='rejected'?'تبرير مرفوض':dec==='pending'?'بانتظار العميل':'بدون تبرير';
        const row=review.addRow([d.subject_no||'',d.subject_name||'',dateOnly(d.work_date),STATUS_AR[d.day_status]||d.day_status||'—',d.justification_id?(JUSTIFICATION_AR[d.justification_type]||'مسجل'):'—',d.justification_text||'—',d.paper_reference||'—',dec==='none'?'—':(DECISION_AR[dec]||dec),d.decision_note||'—',Number(d.preliminary_deduction_days||0),Number(d.final_deduction_days??d.preliminary_deduction_days??0),result]);
        if(dec==='accepted')row.getCell(8).fill={type:'pattern',pattern:'solid',fgColor:{argb:C.green}};else if(dec==='rejected')row.getCell(8).fill={type:'pattern',pattern:'solid',fgColor:{argb:C.red}};else if(dec==='pending')row.getCell(8).fill={type:'pattern',pattern:'solid',fgColor:{argb:C.amber}};
      }
      if(!reviewDays.length)review.addRow(['','','','لا توجد حالات']);styleBody(review,reviewStart,review.lastRow.number,reviewHeaders.length);review.columns=[11,23,12,17,24,28,20,17,26,12,13,18].map((width)=>({width}));setup(review,reviewHeader.number,reviewHeaders.length);

      const summary=wb.addWorksheet('3- الملخص',{views:[{rightToLeft:true}]});
      const summaryHeaders=['الرقم','الموظف','حضور كامل','غياب','دخول مفقود','خروج مفقود','ساعات العمل','ساعات الدوام','التأخير','الخروج المبكر','الوقت الزائد','الخصم النهائي'];
      addTitle(summary,'ملخص الحضور',subtitle,summaryHeaders.length);summary.addRow([]);const summaryHeader=summary.addRow(summaryHeaders);styleHeader(summaryHeader);
      const groups=new Map();
      for(const d of days){
        const key=subjectKey(d);if(!groups.has(key))groups.set(key,{no:d.subject_no||'',name:d.subject_name||'',complete:0,absent:0,missIn:0,missOut:0,worked:0,scheduled:0,late:0,early:0,extra:0,deduction:0});const g=groups.get(key);const finalDeduction=Number(d.final_deduction_days??d.preliminary_deduction_days??0);
        if(d.day_status==='complete')g.complete+=1;if(d.day_status==='absent'&&finalDeduction>0)g.absent+=1;if(d.day_status==='missing_in'&&finalDeduction>0)g.missIn+=1;if(d.day_status==='missing_out'&&finalDeduction>0)g.missOut+=1;g.worked+=Number(d.worked_minutes||0);if(!['day_off','no_schedule'].includes(d.day_status))g.scheduled+=minutesBetween(d.scheduled_start,d.scheduled_end);g.late+=Math.max(0,Number(d.late_arrival_minutes??d.arrival_delta_minutes??0));g.early+=Math.max(0,Number(d.early_departure_minutes??(Number(d.departure_delta_minutes||0)<0?-Number(d.departure_delta_minutes||0):0)));g.extra+=Math.max(0,Number(d.late_departure_minutes??d.departure_delta_minutes??0));g.deduction+=finalDeduction;
      }
      const summaryStart=summaryHeader.number+1;[...groups.values()].sort((a,b)=>String(a.no||a.name).localeCompare(String(b.no||b.name),'ar',{numeric:true})).forEach((g)=>summary.addRow([g.no,g.name,g.complete,g.absent,g.missIn,g.missOut,hhmm(g.worked),hhmm(g.scheduled),hhmm(g.late),hhmm(g.early),hhmm(g.extra),Number(g.deduction.toFixed(2))]));
      styleBody(summary,summaryStart,summary.lastRow.number,summaryHeaders.length);summary.columns=[11,23,14,12,15,15,15,15,12,14,13,14].map((width)=>({width}));setup(summary,summaryHeader.number,summaryHeaders.length);

      const safe=String(client).replace(/[\\/:*?"<>|]/g,'-').slice(0,70);const buffer=await wb.xlsx.writeBuffer();const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`تقرير_الحضور_${safe}_${activeImport.period_from||''}_${activeImport.period_to||''}.xlsx`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
    }catch(e){setErr(e?.message||String(e));}finally{setBusy(false);}
  }

  return <span style={{display:'inline-flex',flexDirection:'column',gap:6}}><button className="btn" type="button" disabled={disabled||busy||!activeImport?.id} onClick={exportReport}>{busy?'جارٍ إعداد التقرير…':'تقرير العميل Excel'}</button>{err&&<span className="hint" style={{color:'#8B2E2E'}}>{err}</span>}</span>;
}
