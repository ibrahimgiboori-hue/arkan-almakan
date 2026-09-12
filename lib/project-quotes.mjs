export const PROJECT_QUOTE_DEFAULTS=Object.freeze({
  ar:Object.freeze({
    clientName:'عميل جديد',
    intro:'يسرنا في أركان المكان أن نضع بين أيديكم عرض السعر التالي لتنفيذ الأعمال الموضحة أدناه وفقاً للمواصفات الفنية المعتمدة.',
    closing:'آملين أن ينال عرضنا استحسانكم، وتفضلوا بقبول فائق الاحترام والتقدير.',
  }),
  en:Object.freeze({
    clientName:'New Client',
    intro:'We are pleased to submit our quotation for the execution of the works described below, in accordance with the approved drawings, specifications, and project requirements.',
    closing:'We trust that our quotation meets your requirements and look forward to the opportunity to work with you.',
    terms:[
      'Payment terms and schedule shall be agreed upon prior to commencement of the works.',
      'Prices are exclusive of VAT. VAT will be added at the applicable statutory rate.',
    ].join('\n'),
  }),
});

export function projectQuoteCanCreate({capabilities=[],primary=false,projectId}){
  if(primary===true)return true;
  const applicable=(capabilities || []).filter((cap)=>
    cap?.scope_type==='all' || (cap?.scope_type==='project' && cap?.scope_key===projectId)
  );
  if(applicable.some((cap)=>cap?.source_key==='projects_full_access'))return true;
  return applicable.some((cap)=>cap?.capability_key==='projects.quotes.create');
}

export function projectQuoteApprovalLabel(state){
  if(!state?.workflow_id)return 'لم يُرسل للمراجعة';
  if(state.workflow_status==='pending')return `لدى ${state.target_group_label || 'جهة المراجعة'}`;
  if(state.workflow_status==='approved')return 'مراجع ماليًا';
  if(state.workflow_status==='returned')return 'معاد للتعديل';
  if(state.workflow_status==='rejected')return 'مرفوض داخليًا';
  return state.workflow_status || '—';
}

export function buildProjectQuotesWorkspace({quotes=[],totals=[],approvalStates=[],capabilities=[],primary=false,projectId}={}){
  const totalsMap={};
  for(const row of totals || [])if(row?.id)totalsMap[row.id]=row;
  const statesMap={};
  for(const pair of approvalStates || [])if(pair?.quoteId)statesMap[pair.quoteId]=pair.state || null;
  const list=[...(quotes || [])];
  return Object.freeze({
    quotes:Object.freeze(list),
    totals:Object.freeze(totalsMap),
    states:Object.freeze(statesMap),
    canCreate:projectQuoteCanCreate({capabilities,primary,projectId}),
    summary:Object.freeze({
      count:list.length,
      approved:list.filter((row)=>statesMap[row.id]?.workflow_status==='approved').length,
      pending:list.filter((row)=>statesMap[row.id]?.workflow_status==='pending').length,
    }),
  });
}

export function buildProjectQuoteRecord({projectId,kind='quotation',language='ar',quoteNo,settings={},systemVatRate=0.15}){
  if(!projectId)throw new Error('المشروع غير محدد.');
  if(!quoteNo)throw new Error('رقم العرض غير متاح.');
  const docKind=kind==='boq'?'boq':'quotation';
  const lang=language==='en'?'en':'ar';
  const english=lang==='en';
  const defaults=PROJECT_QUOTE_DEFAULTS[lang];
  const vat=Number(settings?.vat_rate ?? systemVatRate);
  return Object.freeze({
    quote_no:quoteNo,
    doc_kind:docKind,
    language:lang,
    project_id:projectId,
    client_name:defaults.clientName,
    vat_rate:Number.isFinite(vat)?vat:Number(systemVatRate || 0),
    terms_text:english?PROJECT_QUOTE_DEFAULTS.en.terms:String(settings?.quote_terms_default || ''),
    intro_text:defaults.intro,
    closing_text:defaults.closing,
    show_qty:docKind==='boq',
    show_en_desc:english,
  });
}
