import { Link } from 'react-router-dom';

/** Five-petal sakura blossom used in the logo and decorations. */
export function Blossom({ size = 32, className = '', petal = 'var(--color-sakura)', center = 'var(--color-beni)' }: {
  size?: number; className?: string; petal?: string; center?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden>
      {[0, 72, 144, 216, 288].map((a) => (
        <path key={a} transform={`rotate(${a} 50 50)`} fill={petal}
              d="M50 50 C 36 38, 34 16, 46 8 L 50 14 L 54 8 C 66 16, 64 38, 50 50 Z" />
      ))}
      <circle cx="50" cy="50" r="8" fill={center} />
      {[0, 72, 144, 216, 288].map((a) => (
        <circle key={a} transform={`rotate(${a + 36} 50 50)`} cx="50" cy="34" r="2.2" fill={center} opacity=".7" />
      ))}
    </svg>
  );
}

export function Logo({ to = '/', light = false }: { to?: string; light?: boolean }) {
  return (
    <Link to={to} className="group flex items-center gap-2.5" aria-label="KanaBloom home">
      <span className="transition-transform duration-500 group-hover:rotate-[72deg]"><Blossom size={34} /></span>
      <span className={`font-display text-xl font-semibold tracking-tight ${light ? 'text-white' : 'text-charcoal'}`}>
        Kana<span className="text-beni">Bloom</span>
      </span>
    </Link>
  );
}

/** Falling petals. Purely decorative; disabled for reduced-motion users by the global CSS rule. */
export function FallingPetals({ count = 14 }: { count?: number }) {
  const petals = Array.from({ length: count }, (_, i) => {
    const seed = (i * 9301 + 49297) % 233280 / 233280;
    return { left: `${(i * 97) % 100}%`, delay: `${(seed * 12).toFixed(1)}s`, dur: `${10 + (i % 5) * 3}s`, size: 10 + (i % 4) * 5, sway: `${3 + (i % 3)}s` };
  });
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden" aria-hidden>
      {petals.map((p, i) => (
        <div key={i} className="absolute top-0 animate-fall" style={{ left: p.left, animationDelay: p.delay, animationDuration: p.dur }}>
          <div className="animate-sway" style={{ animationDuration: p.sway }}>
            <svg width={p.size} height={p.size} viewBox="0 0 20 20">
              <path d="M10 1 C 4 6, 4 14, 10 19 C 16 14, 16 6, 10 1 Z" fill="var(--color-sakura)" opacity=".75" />
            </svg>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Hero illustration: a blossoming branch across an ensō (brush circle) framing a large あ. */
export function HeroArt() {
  return (
    <svg viewBox="0 0 420 420" className="h-full w-full" role="img" aria-label="A cherry blossom branch around the hiragana character a">
      <defs>
        <radialGradient id="sun" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FBE4EA" /><stop offset="100%" stopColor="#FDF1F4" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="210" cy="210" r="200" fill="url(#sun)" />
      <path d="M 210 52 A 158 158 0 1 1 92 108" fill="none" stroke="#2B2A2E" strokeWidth="14" strokeLinecap="round" opacity=".88" />
      <path d="M 92 108 A 158 158 0 0 1 120 84" fill="none" stroke="#2B2A2E" strokeWidth="6" strokeLinecap="round" opacity=".5" />
      <text x="210" y="262" textAnchor="middle" fontFamily="Klee One, serif" fontSize="170" fill="#B83A4B">あ</text>
      <path d="M 18 70 C 90 80, 150 60, 210 30 M 120 72 C 140 50, 160 44, 176 46 M 60 74 C 70 96, 66 116, 52 130"
            fill="none" stroke="#5B4A44" strokeWidth="6" strokeLinecap="round" />
      {[[210, 30, 44], [176, 46, 34], [120, 72, 38], [52, 130, 30], [150, 60, 22], [86, 80, 24]].map(([x, y, s], i) => (
        <g key={i} transform={`translate(${x - s / 2} ${y - s / 2})`}><Blossom size={s} /></g>
      ))}
      {[[300, 120], [340, 220], [280, 330], [120, 320]].map(([x, y], i) => (
        <path key={i} transform={`translate(${x} ${y}) rotate(${i * 50})`} d="M0 -9 C -6 -3, -6 4, 0 9 C 6 4, 6 -3, 0 -9 Z" fill="#F2A7B8" opacity=".8" />
      ))}
    </svg>
  );
}
