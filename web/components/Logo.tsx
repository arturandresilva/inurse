// Logótipo iNurse (vetorial): letras em traço arredondado azul + coração vermelho com batimento no "i".
// pulse=false tira o batimento (para tamanhos muito pequenos, onde a linha deixa de se ler).
export default function Logo({ height = 30, mono, className, pulse = true }: { height?: number; mono?: string; className?: string; pulse?: boolean }) {
  const blue = mono ?? "#2EB3EA";
  const red = mono ?? "#E8323C";
  return (
    <svg className={className} viewBox="-10 -8 320 72" height={height} role="img" aria-label="iNurse">
      <g fill="none" stroke={blue} strokeWidth={8.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6.30,27.50 V55.70" />
        <path d="M30.40,55.70 V4.30 L67.40,55.70 V4.30" />
        <path d="M91.50,4.30 V42.70 A13,13 0 0 0 104.50,55.70 H114.50 A13,13 0 0 0 127.50,42.70 V4.30" />
        <path d="M151.60,55.70 V4.30 H175.60 A11,11 0 0 1 186.60,15.30 V17.70 A11,11 0 0 1 175.60,28.70 H151.60" />
        <path d="M166.30,28.70 L186.60,55.70" />
        <path d="M245.70,4.30 H221.70 A11,11 0 0 0 210.70,15.30 V19.00 A11,11 0 0 0 221.70,30.00 H234.70 A11,11 0 0 1 245.70,41.00 V44.70 A11,11 0 0 1 234.70,55.70 H210.70" />
        <path d="M301.80,4.30 H269.80 V55.70 H301.80 M269.80,30.00 H296.04" />
      </g>
      <path transform="translate(-3.2,2) scale(0.95)" fill={red}
        d="M10,18.6 C7.2,16.1 0.6,11.6 0.6,6.3 C0.6,2.9 3.2,0.4 6.2,0.4 C8,0.4 9.3,1.4 10,2.6 C10.7,1.4 12,0.4 13.8,0.4 C16.8,0.4 19.4,2.9 19.4,6.3 C19.4,11.6 12.8,16.1 10,18.6 Z" />
      {pulse && (
        <path d="M-1.5,10.6 H2.6 L4.6,6.6 L7.2,14.2 L9.0,9.4 H14.2" fill="none" stroke={mono ? "#1C2A4A" : "#fff"} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}
