import Link from 'next/link';

export default function Dashboard() {
  return (
    <section
      data-idle-work-surface="true"
      data-work-center-visibility="idle-only"
      style={{
        minHeight:'calc(100dvh - 80px)',
        padding:'clamp(38px, 7vh, 76px) clamp(8px, 2vw, 24px)',
        display:'flex',
        flexDirection:'column',
        alignItems:'flex-start',
        justifyContent:'flex-start',
        gap:22,
      }}
    >
      <div>
        <h1 style={{margin:0,fontSize:'clamp(25px, 2.2vw, 32px)',fontWeight:820,lineHeight:1.3}}>مركز العمل</h1>
        <p style={{margin:'8px 0 0',fontSize:14,lineHeight:1.7,color:'var(--raw-muted, #756d64)'}}>
          يظهر هنا ما يخصك عندما لا تكون داخل بوابة أو منطقة عمل.
        </p>
      </div>

      <nav aria-label="منظور العمل الشخصي" style={{display:'grid',gap:11,minWidth:'min(100%, 280px)'}}>
        <Link href="/dashboard/my-work" style={{color:'inherit',textDecoration:'none',fontSize:17,fontWeight:760}}>أعمالي</Link>
        <Link href="/dashboard/approvals" style={{color:'inherit',textDecoration:'none',fontSize:17,fontWeight:760}}>بانتظار قراري</Link>
      </nav>
    </section>
  );
}
