const IGNORE = new Set(['اعمال','أعمال','العمل','بند','شركة','مؤسسة','للمقاولات','المقاولات','مشروع','مشاريع','قسم','ادارة','إدارة']);

const digitMap = {'٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9','٫':'.','٬':''};

export function normalizeDigits(s=''){
  return String(s).replace(/[٠-٩٫٬]/g,(d)=>digitMap[d]??d);
}
export function normalizeArabicText(s=''){
  return normalizeDigits(s)
    .toLowerCase()
    .replace(/[أإآ]/g,'ا')
    .replace(/ة/g,'ه')
    .replace(/ى/g,'ي')
    .replace(/[ـ]/g,'')
    .replace(/[^\p{L}\p{N}.]+/gu,' ')
    .replace(/\s+/g,' ')
    .trim();
}
function stemToken(t=''){
  let x=normalizeArabicText(t);
  x=x.replace(/^(وال|بال|كال|فال|لل)/,'').replace(/^ال/,'');
  return x;
}
function usefulTokens(s=''){
  return normalizeArabicText(s).split(' ').filter(t=>t.length>=2&&!IGNORE.has(t));
}
function variants(row,fields){
  const out=[];
  for(const f of fields){
    const v=row?.[f];
    if(!v) continue;
    out.push(String(v));
    if(f==='name_ar'){
      out.push(String(v).replace(/^شركة\s+/,'').replace(/^مؤسسة\s+/,'').replace(/\s+للمقاولات.*$/,'').replace(/\s+للمقاولات$/,''));
    }
  }
  return [...new Set(out.filter(Boolean))];
}
function entityMatch(raw,list,fields){
  const t=normalizeArabicText(raw);
  const scored=[];
  for(const row of list||[]){
    let best=0;
    for(const v of variants(row,fields)){
      const n=normalizeArabicText(v);
      if(!n) continue;
      if(t.includes(n)) best=Math.max(best,1000+n.length);
      const toks=usefulTokens(v);
      const hits=toks.filter(x=>{
        const st=stemToken(x);
        return t.includes(x)||(st.length>=3&&t.includes(st));
      });
      if(hits.length){
        const score=hits.reduce((s,x)=>s+Math.max(x.length,stemToken(x).length),0)+(hits.length*20);
        best=Math.max(best,score);
      }
    }
    if(best>0) scored.push({row,score:best});
  }
  scored.sort((a,b)=>b.score-a.score);
  if(!scored.length) return {row:null,ambiguous:[]};
  const top=scored[0];
  const near=scored.filter(x=>x.score===top.score);
  return {row:near.length===1?top.row:null,ambiguous:near.map(x=>x.row)};
}
function firstNumber(raw){
  const m=normalizeDigits(raw).match(/(?:^|\s)(\d+(?:[.,]\d+)?)(?=\s|$)/);
  return m?Number(m[1].replace(',','.')):null;
}
function statusOf(text){
  const t=normalizeArabicText(text);
  if(/(^| )(نصف|نص)( |$)/.test(t)) return 'half';
  if(/(^| )(غياب|غائب)( |$)/.test(t)) return 'absent';
  if(/(^| )(توقف|متوقف)( |$)/.test(t)) return 'stopped';
  if(/(^| )(اجازه|اجازة)( |$)/.test(t)) return 'leave';
  if(/(^| )(كامل|حاضر|حضور)( |$)/.test(t)) return 'full';
  return null;
}
function expenseCategory(raw){
  const t=normalizeArabicText(raw);
  if(/بنزين|ديزل|وقود/.test(t)) return 'وقود';
  if(/وجبه|وجبات|فطار|افطار|غدا|غداء|عشاء/.test(t)) return 'وجبات';
  if(/تذكره|تذاكر|ترحيل|نقل|مواصلات/.test(t)) return 'ترحيل';
  if(/سكن|ايجار سكن/.test(t)) return 'سكن';
  if(/سقال/.test(t)) return 'سقالات';
  if(/تأمين طبي|تامين طبي/.test(raw)) return 'تأمين طبي';
  if(/خشب|منشار|كلبسات|مسامير|عده|اداه|معدات|أداة|عدة/.test(t)) return 'عدد وأدوات';
  if(/مواد|اسمنت|رمل|بحص|بلك/.test(t)) return 'مواد';
  if(/عهده|عهدة/.test(raw)) return 'عهدة';
  if(/تامين|تأمين|ضمان|مسترد/.test(raw)) return 'تأمين مسترد';
  if(/ضيافه|ضيافة/.test(raw)) return 'ضيافة';
  if(/مصروف|صرف/.test(t)) return 'أخرى';
  return null;
}
function isRecoverable(raw,category,payer){
  // ما يدفعه المقاول يبقى مستحقاً له، ولو سمّاه داخلياً عهدة أو تأميناً.
  if(payer==='contractor') return false;
  if(category==='تأمين طبي') return false;
  return category==='عهدة'||category==='تأمين مسترد'||/(مسترد|ضمان)/.test(normalizeArabicText(raw));
}
function chargeFor(contractor,category){
  if(!contractor) return 'arkan';
  if(category==='وجبات') return contractor.meals_charge_to||'contractor';
  if(category==='ترحيل'||category==='وقود') return contractor.transport_charge_to||'contractor';
  if(category==='سكن') return contractor.housing_charge_to||'contractor';
  if(category==='عدد وأدوات'||category==='سقالات') return contractor.tools_charge_to||'contractor';
  return 'arkan';
}

export function parseSiteCommand(raw,ctx={}){
  const text=normalizeArabicText(raw);
  if(!text) return {kind:'empty'};
  const contractors=ctx.contractors||[], workers=ctx.workers||[], items=ctx.items||[];
  const cm=entityMatch(raw,contractors,['operation_alias','name_ar','contractor_no']);
  const wm=entityMatch(raw,workers,['full_name']);
  const im=entityMatch(raw,items,['description_ar']);
  const contractor=cm.row, worker=wm.row, item=im.row;
  const amount=firstNumber(raw);

  if(/(^| )نقل( |$)/.test(text)){
    if(!worker) return {kind:'need',intent:'transfer',message:wm.ambiguous.length?'اسم العامل غير محدد بما يكفي':'حدد اسم العامل',choices:wm.ambiguous};
    if(!contractor) return {kind:'need',intent:'transfer',message:cm.ambiguous.length?'حدد المقاول المقصود':'حدد المقاول الجديد',choices:cm.ambiguous};
    return {kind:'transfer',worker,contractor,effective_from:ctx.date};
  }

  if(/حضور الكل|الكل حاضر|حاضر الكل|جميع العمال حاضر/.test(text)){
    if(!contractor) return {kind:'need',intent:'bulk_attendance',message:'حدد المقاول'};
    return {kind:'bulk_attendance',contractor,status:'full'};
  }

  const st=statusOf(raw);
  if(st && worker) return {kind:'attendance',worker,status:st};

  if(/(^| )سلفه( |$)/.test(text)){
    if(!contractor) return {kind:'need',intent:'advance',message:'حدد المقاول'};
    if(!(amount>0)) return {kind:'need',intent:'advance',message:'اكتب مبلغ السلفة'};
    return {kind:'advance',contractor,amount,notes:raw};
  }

  if(/(^| )(دفعه|سداد)( |$)/.test(text)){
    if(!contractor) return {kind:'need',intent:'payment',message:'حدد المقاول'};
    if(!(amount>0)) return {kind:'need',intent:'payment',message:'اكتب مبلغ الدفعة'};
    const source=/نقد|كاش/.test(text)?'cash':(/عهده|عهدة/.test(raw)?'custody':'bank');
    return {kind:'payment',contractor,amount,source,notes:raw};
  }

  const explicitExpense=/مصروف|صرف|شراء|فاتوره|فاتورة/.test(text);
  if(item && !explicitExpense){
    if(!contractor) return {kind:'need',intent:'output',message:'حدد المقاول المنفذ'};
    if(!(amount>0)) return {kind:'need',intent:'output',message:'اكتب الكمية المنفذة'};
    return {kind:'output',contractor,item,qty:amount,unit:item.unit||''};
  }

  const cat=expenseCategory(raw);
  if(cat){
    if(!contractor) return {kind:'need',intent:'expense',message:'حدد المقاول'};
    if(!(amount>0)) return {kind:'need',intent:'expense',message:'اكتب مبلغ المصروف'};
    const payer=/من العهده|من العهدة|عهدة اركان|عهدة أركان/.test(raw)?'arkan_custody':
      (/اركان دفعت|أركان دفعت|دفعته اركان|دفعته أركان/.test(raw)?'arkan_direct':'contractor');
    let charge_to=chargeFor(contractor,cat);
    if(/على المقاول/.test(text)) charge_to='contractor';
    if(/على اركان/.test(text)) charge_to='arkan';
    if(/على المالك/.test(text)) charge_to='owner';
    return {kind:'expense',contractor,amount,category:cat,payer,charge_to,is_recoverable:isRecoverable(raw,cat,payer),notes:raw};
  }

  if(st && !worker) return {kind:'need',intent:'attendance',message:wm.ambiguous.length?'اسم العامل متشابه؛ اختر العامل':'اكتب اسم العامل',choices:wm.ambiguous};

  return {kind:'unknown',message:'لم أفهم الحركة كاملة. استخدم مثالاً قصيراً أو الأزرار السريعة.'};
}

export const SITE_COMMAND_EXAMPLES=[
  'الجساس حضور الكل',
  'محمد أحمد نصف',
  'AAA بلك 80',
  'الجساس بنزين 250',
  'سلفة الجساس 1000',
];
