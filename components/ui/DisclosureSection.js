export default function DisclosureSection({ title, description = '', children, defaultOpen = false, actions = null }) {
  return (
    <details
      open={defaultOpen || undefined}
      data-disclosure-section="true"
      style={{
        border: '1px solid var(--line, #d1d5db)',
        borderRadius: 10,
        marginBottom: 14,
        background: 'var(--raw-paper, #fff)',
      }}
    >
      <summary
        style={{
          listStyle: 'none',
          cursor: 'pointer',
          padding: '12px 14px',
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <strong>{title}</strong>
        {description ? <span className="muted" style={{ fontSize: 12.5 }}>{description}</span> : null}
        <span style={{ flex: 1 }} />
        {actions ? <span onClick={(event) => event.preventDefault()}>{actions}</span> : null}
        <span aria-hidden="true">▾</span>
      </summary>
      <div style={{ padding: '0 12px 12px' }}>{children}</div>
    </details>
  );
}
