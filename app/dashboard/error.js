'use client';

export default function DashboardError({ error, reset }) {
  return (
    <main
      role="alert"
      style={{
        minHeight:'100dvh',
        padding:'28px 24px',
        boxSizing:'border-box',
        background:'var(--raw-bg, #f7f5f1)',
        color:'var(--raw-ink, #2f2924)',
        direction:'rtl',
      }}
    >
      <div style={{maxWidth:720}}>
        <h1 style={{margin:'0 0 8px',fontSize:24}}>تعذر إظهار مساحة العمل</h1>
        <p style={{margin:'0 0 18px',color:'var(--raw-muted, #756d64)',lineHeight:1.7}}>
          العضو لم يُحذف ولم تتغير بياناته. حدث خلل في العرض، ويمكن إعادة محاولة تركيب مساحة العمل.
        </p>
        <button type="button" className="btn" onClick={() => reset?.()}>إعادة المحاولة</button>
        {error?.message ? (
          <details style={{marginTop:18,fontSize:12,color:'var(--raw-muted, #756d64)'}}>
            <summary>تفاصيل تقنية</summary>
            <pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{String(error.message)}</pre>
          </details>
        ) : null}
      </div>
    </main>
  );
}
