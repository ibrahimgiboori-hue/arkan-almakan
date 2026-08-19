export const metadata = {
  title: 'فرص العمل | أركان المكان للمقاولات',
  description: 'بوابة التوظيف الرسمية لأركان المكان للمقاولات - استعراض الفرص الوظيفية والتقديم عليها.',
  openGraph: { title: 'فرص العمل | أركان المكان للمقاولات', description: 'بوابة التوظيف الرسمية لأركان المكان للمقاولات', type: 'website' },
};

export default function JobsLayout({ children }) {
  return (
    <div style={{minHeight:'100vh',background:'#f3f4f4',color:'#3f4346'}}>
      <header style={{background:'#fff',borderBottom:'1px solid #e3e5e6'}}>
        <div style={{maxWidth:920,margin:'0 auto',padding:'18px 20px',minHeight:142,display:'flex',direction:'rtl',alignItems:'center',justifyContent:'space-between',gap:28,flexWrap:'wrap'}}>
          <img src="/brand/arkan-logo.svg" alt="أركان المكان - ARKAN AL MAKAN" style={{width:110,height:125,objectFit:'contain',objectPosition:'center',display:'block',flex:'0 0 auto'}} />
          <div style={{textAlign:'right',lineHeight:1.55,marginInlineStart:'auto'}}>
            <div style={{fontSize:20,fontWeight:700,color:'#8B3332'}}>بوابة التوظيف</div>
            <div style={{fontSize:13.5,color:'#5F6468'}}>أركان المكان للمقاولات</div>
          </div>
        </div>
      </header>
      <main>{children}</main>
      <footer style={{maxWidth:920,margin:'0 auto',padding:'10px 20px 34px',textAlign:'center',fontSize:12.5,color:'#777d80'}}>أركان المكان للمقاولات · بوابة التوظيف الرسمية</footer>
    </div>
  );
}
