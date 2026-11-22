// Display helpers. The database stores UTC; everything shown is converted to the viewer's local timezone.

export function formatDuration(totalSeconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(totalSeconds ?? 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

export function formatDateTime(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(iso));
}

export function formatDate(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return '—';
  // Plain YYYY-MM-DD values are calendar days already in the learner's timezone — don't shift them.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone }).format(new Date(iso));
}

export function shortDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return `${Math.floor(diff / 86400)} d ago`;
}

export function localTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

export function uuid(): string {
  return crypto.randomUUID();
}
