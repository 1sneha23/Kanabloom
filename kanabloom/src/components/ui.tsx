import type { ReactNode } from 'react';

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={`animate-spin text-beni ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity=".2" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-mist" role="status">
      <Spinner className="h-8 w-8" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string | null; onRetry?: () => void }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-beni/20 bg-beni/5 px-4 py-3 text-sm text-beni-dark">
      <span aria-hidden className="mt-0.5">⚠</span>
      <p className="flex-1 whitespace-pre-line">{message}</p>
      {onRetry && <button className="font-semibold underline" onClick={onRetry}>Retry</button>}
    </div>
  );
}

export function SuccessBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return <div role="status" className="rounded-2xl border border-matcha/30 bg-matcha/10 px-4 py-3 text-sm text-[#4f6b4c]">{message}</div>;
}

export function EmptyState({ icon = '🌸', title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="text-4xl" aria-hidden>{icon}</div>
      <h3 className="text-xl font-semibold">{title}</h3>
      {children && <div className="max-w-md text-sm text-mist">{children}</div>}
    </div>
  );
}

export function ProgressRing({ value, size = 120, stroke = 10, label, sublabel, color = 'var(--color-beni)' }: {
  value: number; size?: number; stroke?: number; label?: ReactNode; sublabel?: ReactNode; color?: string;
}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}
         role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--color-blush)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
                strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-display text-2xl font-semibold">{label ?? `${Math.round(pct)}%`}</span>
        {sublabel && <span className="text-xs text-mist">{sublabel}</span>}
      </div>
    </div>
  );
}

export function ProgressBar({ value, className = '' }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value || 0));
  return (
    <div className={`h-2.5 overflow-hidden rounded-full bg-blush ${className}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-gradient-to-r from-sakura-deep to-beni transition-[width] duration-700" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function StatCard({ icon, label, value, hint }: { icon: string; label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="card flex items-center gap-4 p-5">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blush text-2xl" aria-hidden>{icon}</div>
      <div className="min-w-0">
        <div className="text-sm text-mist">{label}</div>
        <div className="font-display text-2xl font-semibold leading-tight">{value}</div>
        {hint && <div className="text-xs text-mist">{hint}</div>}
      </div>
    </div>
  );
}

export function SectionTitle({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-6">
      {eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-beni">{eyebrow}</div>}
      <h2 className="text-3xl font-semibold md:text-4xl">{title}</h2>
      {children && <p className="mt-2 max-w-2xl text-ink">{children}</p>}
    </div>
  );
}
