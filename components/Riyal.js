export default function Riyal({ size = 1, style }) {
  return (
    <svg viewBox="0 0 1000 1116.5" role="img" aria-label="ريال سعودي"
         fill="currentColor" fillRule="evenodd"
         style={{ height: `${size * 0.82}em`, width: 'auto', display: 'inline-block',
                  verticalAlign: '-0.08em', marginInlineStart: '0.18em', ...style }}>
      <path d="M998.9 908.4 L622.2 988.7 L600.7 1047.5 L588.2 1115.4 L964.9 1035.1 L987.6 974.0 Z M704.8 57.7 L588.2 155.0 L588.2 513.6 L472.9 539.6 L469.5 0.0 L354.1 93.9 L352.9 563.3 L89.4 621.0 L55.4 742.1 L351.8 683.3 L352.9 836.0 L33.9 903.8 L0.0 1030.5 L377.8 938.9 L464.9 815.6 L475.1 657.2 L588.2 634.6 L588.2 874.4 L966.1 793.0 L998.9 668.6 L704.8 729.6 L704.8 609.7 L964.9 553.2 L998.9 434.4 L704.8 488.7 Z" />
    </svg>
  );
}
