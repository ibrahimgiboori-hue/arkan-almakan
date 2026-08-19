import { CONSTRUCTION_JOB_CATALOG, buildDefaultQuestions, getJobProfile } from './recruitment-catalog';

const scoreMap=(items)=>Object.fromEntries(items.map((x,i)=>[x,Math.round((i/(items.length-1||1))*100)]));
const single=(label,question,options,weight,extra={})=>({label,question_text:question,answer_type:'single',options,score_map:scoreMap(options),weight,criterion_type:'normal',...extra});

const EXP_MANAGER=['أقل من 3 سنوات','3 - 5 سنوات','6 - 9 سنوات','10 - 14 سنة','15 سنة فأكثر'];
const EXP_PRO=['أقل من سنة','1 - 2 سنة','3 - 5 سنوات','6 - 9 سنوات','10 سنوات فأكثر'];
const LEVEL=['أساسي','جيد','متقدم','خبير'];

const EXTRA_PROFILES=[
  {
    key:'hr-gov-relations-manager',title:'مدير الموارد البشرية والعلاقات الحكومية',department:'الموارد البشرية',family:'support',level:'manager',levelLabel:'إدارة',saudiGroupCode:'1212',saudiGroupName:'مديرو الموارد البشرية',
    duties:['• إعداد وتطبيق سياسات وإجراءات الموارد البشرية','• إدارة التوظيف والعقود وملفات الموظفين','• متابعة المنصات والخدمات والعلاقات الحكومية'],
    questions:()=>[
      single('سنوات الخبرة','كم سنة خبرتك بالموارد البشرية؟',EXP_MANAGER,22),
      single('أنظمة العمل','ما مستوى معرفتك بنظام العمل؟',LEVEL,20),
      single('المنصات الحكومية','ما خبرتك بمنصات الموارد البشرية؟',['محدودة','قوى فقط','قوى والتأمينات','منصات متعددة','إدارة شاملة'],24),
      single('العلاقات الحكومية','ما مستوى خبرتك بالعلاقات الحكومية؟',LEVEL,18),
      single('المسؤولية الإدارية','ما مستوى إدارتك لفريق عمل؟',['لم أدر فريقاً','1 - 3 موظفين','4 - 7 موظفين','8 - 15 موظفاً','أكثر من 15'],16),
    ]
  },
  {
    key:'government-relations-manager',title:'مدير العلاقات الحكومية',department:'الموارد البشرية',family:'support',level:'manager',levelLabel:'إدارة',saudiGroupCode:'1219',saudiGroupName:'مديرو خدمات الأعمال',
    duties:['• إدارة معاملات وخدمات الجهات الحكومية','• متابعة المنصات والتراخيص والتجديدات','• ضمان الالتزام بالمواعيد والمتطلبات النظامية'],
    questions:()=>[
      single('سنوات الخبرة','كم سنة خبرتك بالعلاقات الحكومية؟',EXP_MANAGER,24),
      single('المنصات الحكومية','كم منصة حكومية تتقن استخدامها؟',['1 - 2','3 - 4','5 - 7','8 - 10','أكثر من 10'],24),
      single('التراخيص','ما خبرتك بالتراخيص والتجديدات؟',LEVEL,20),
      single('حل المعاملات','ما مستوى حل المعاملات المعقدة؟',LEVEL,18),
      single('المتابعة','ما مستوى دقتك بمتابعة المواعيد؟',LEVEL,14),
    ]
  },
  {
    key:'hr-manager',title:'مدير الموارد البشرية',department:'الموارد البشرية',family:'support',level:'manager',levelLabel:'إدارة',saudiGroupCode:'1212',saudiGroupName:'مديرو الموارد البشرية',
    duties:['• إدارة سياسات وعمليات الموارد البشرية','• الإشراف على التوظيف والعقود والأداء','• متابعة الامتثال وبيانات الموظفين'],
    questions:()=>[
      single('سنوات الخبرة','كم سنة خبرتك بالموارد البشرية؟',EXP_MANAGER,24),
      single('أنظمة العمل','ما مستوى معرفتك بنظام العمل؟',LEVEL,22),
      single('التوظيف','ما مستوى إدارتك لعمليات التوظيف؟',LEVEL,18),
      single('المنصات','ما خبرتك بمنصات الموارد البشرية؟',['محدودة','قوى فقط','قوى والتأمينات','منصات متعددة','إدارة شاملة'],20),
      single('القيادة','ما مستوى إدارتك لفريق عمل؟',['لم أدر فريقاً','1 - 3 موظفين','4 - 7 موظفين','8 - 15 موظفاً','أكثر من 15'],16),
    ]
  },
];

const normalize=(s='')=>String(s).replace(/[ـ]/g,'').replace(/\s+/g,' ').replace(/\s*و\s*/g,'و').trim().toLowerCase();

export const ALL_RECRUITMENT_PROFILES=[...CONSTRUCTION_JOB_CATALOG,...EXTRA_PROFILES];

export function matchRecruitmentProfile(title,profileKey){
  if(profileKey){
    const direct=getJobProfile(profileKey)||EXTRA_PROFILES.find(x=>x.key===profileKey);
    if(direct)return direct;
  }
  const t=normalize(title);
  const exact=ALL_RECRUITMENT_PROFILES.find(x=>normalize(x.title)===t);
  if(exact)return exact;
  if(t.includes('موارد بشرية')&&t.includes('علاقات حكومية')) return EXTRA_PROFILES[0];
  if(t.includes('علاقات حكومية')) return EXTRA_PROFILES[1];
  if(t.includes('موارد بشرية')) return EXTRA_PROFILES[2];
  // مطابقة تقريبية بسيطة وآمنة: وجود كلمات المسمى الرئيسية.
  const words=t.split(' ').filter(x=>x.length>2);
  let best=null,bestScore=0;
  for(const p of CONSTRUCTION_JOB_CATALOG){
    const pt=normalize(p.title); const score=words.filter(w=>pt.includes(w)).length;
    if(score>bestScore){best=p;bestScore=score;}
  }
  return bestScore>=2?best:null;
}

export function recommendedQuestions(profile){
  if(!profile)return [
    single('سنوات الخبرة','كم سنة خبرتك بهذا المجال؟',EXP_PRO,24),
    single('الخبرة العملية','ما مستوى خبرتك العملية؟',LEVEL,22),
    single('الاستقلالية','ما مستوى عملك باستقلالية؟',LEVEL,20),
    single('الجودة','ما مستوى التزامك بجودة العمل؟',LEVEL,18),
    single('السلامة','ما مستوى التزامك بسلامة العمل؟',LEVEL,16),
  ];
  return profile.questions?profile.questions():buildDefaultQuestions(profile);
}
