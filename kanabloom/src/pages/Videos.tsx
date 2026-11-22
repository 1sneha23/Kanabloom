import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchMyVideoProgress, fetchPublishedVideos } from '../lib/api';
import { rpc } from '../lib/supabase';
import { signedMediaUrl } from '../lib/audio';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../auth/AuthProvider';
import { MODULE_LABEL, STYLE_LABEL, type Module, type Video } from '../lib/types';
import { EmptyState, ErrorBanner, PageLoader, ProgressBar, SectionTitle } from '../components/ui';
import { formatDuration } from '../lib/format';

const CATEGORIES: Module[] = ['hiragana', 'katakana', 'greetings', 'self_intro', 'business', 'writing'];

function Thumb({ v }: { v: Video }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { if (v.thumbnail_path) signedMediaUrl(v.thumbnail_path).then(setUrl).catch(() => setUrl(null)); }, [v.thumbnail_path]);
  return url ? <img src={url} alt="" className="aspect-video w-full object-cover" loading="lazy" /> : (
    <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-blush to-sakura/40">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-beni shadow" aria-hidden>▶</span>
    </div>
  );
}

export function VideoLibrary() {
  const { data, loading, error, reload } = useAsync(async () => {
    const [videos, progress] = await Promise.all([fetchPublishedVideos(), fetchMyVideoProgress()]);
    return { videos, progress };
  }, []);
  const [cat, setCat] = useState<Module | 'all'>('all');
  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorBanner message={error} onRetry={reload} />;
  if (!data) return null;
  const list = data.videos.filter((v) => cat === 'all' || v.category === cat);

  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="どうが" title="Video Learning Centre">Short lessons taught by an animated teacher, a human-like AI teacher, or animated characters — all with captions.</SectionTitle>
      <div className="flex flex-wrap gap-2">
        {(['all', ...CATEGORIES] as const).map((c) => (
          <button key={c} onClick={() => setCat(c)} className={`rounded-full px-4 py-2 text-sm font-medium ${cat === c ? 'bg-beni text-white' : 'bg-white text-ink ring-1 ring-blush'}`}>{c === 'all' ? 'All' : MODULE_LABEL[c]}</button>
        ))}
      </div>
      {list.length === 0 ? (
        <EmptyState icon="🎬" title="No videos published here yet">Videos are being prepared by the KanaBloom team. Meanwhile, the lessons and writing studio are ready for you.</EmptyState>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((v) => {
            const p = data.progress.get(v.id);
            const dur = p?.duration_seconds ?? v.duration_seconds;
            const pct = p?.completed ? 100 : dur ? (p?.max_position_seconds ?? 0) / dur * 100 : 0;
            return (
              <Link key={v.id} to={`/videos/${v.id}`} className="card overflow-hidden transition hover:-translate-y-1 hover:shadow-[var(--shadow-lift)]">
                <Thumb v={v} />
                <div className="space-y-2 p-5">
                  <div className="flex flex-wrap gap-1.5"><span className="chip">{MODULE_LABEL[v.category]}</span><span className="chip !bg-ivory !text-ink">{STYLE_LABEL[v.teaching_style]}</span></div>
                  <h3 className="kana text-lg font-semibold">{v.title}</h3>
                  <p className="kana line-clamp-2 text-sm text-ink">{v.description}</p>
                  <div className="flex items-center gap-2 text-xs text-mist">
                    <ProgressBar value={pct} className="flex-1" /><span>{p?.completed ? 'Completed ✓' : v.duration_seconds ? formatDuration(v.duration_seconds) : ''}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function VideoPlayer() {
  const { id } = useParams();
  const { markActive } = useAuth();
  const { data, loading, error, reload } = useAsync(async () => {
    const [videos, progress] = await Promise.all([fetchPublishedVideos(), fetchMyVideoProgress()]);
    const v = videos.find((x) => x.id === id);
    if (!v) throw new Error('Video not found or not published.');
    const src = v.storage_path ? await signedMediaUrl(v.storage_path, 4 * 3600) : v.external_url!;
    return { v, src, progress: progress.get(v.id) };
  }, [id]);
  const ref = useRef<HTMLVideoElement>(null);
  const lastSave = useRef(0);
  const [saveError, setSaveError] = useState(false);
  const [completed, setCompleted] = useState(false);

  const captionsUrl = useMemo(() => {
    if (!data?.v.captions_vtt) return null;
    return URL.createObjectURL(new Blob([data.v.captions_vtt], { type: 'text/vtt' }));
  }, [data?.v.captions_vtt]);
  useEffect(() => () => { if (captionsUrl) URL.revokeObjectURL(captionsUrl); }, [captionsUrl]);
  useEffect(() => { setCompleted(Boolean(data?.progress?.completed)); }, [data?.progress?.completed]);

  const save = async (force = false) => {
    const el = ref.current; if (!el || !data) return;
    const now = Date.now();
    if (!force && now - lastSave.current < 10_000) return;
    lastSave.current = now;
    try {
      const r = await rpc<{ completed: boolean }>('record_video_progress', { p_video_id: data.v.id, p_position: el.currentTime, p_duration: Number.isFinite(el.duration) ? el.duration : null });
      setCompleted(r.completed); setSaveError(false);
    } catch { setSaveError(true); }
  };

  // Save position when leaving the page.
  useEffect(() => () => { void save(true); }, [data?.v.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorBanner message={error} onRetry={reload} />;
  if (!data) return null;
  const { v, src } = data;

  return (
    <div className="space-y-5">
      <Link to="/videos" className="btn-ghost !px-2 text-sm">← All videos</Link>
      <div className="overflow-hidden rounded-[var(--radius-card)] bg-charcoal shadow-[var(--shadow-soft)]">
        <video ref={ref} src={src} controls playsInline preload="metadata" className="aspect-video w-full" crossOrigin="anonymous"
               onLoadedMetadata={() => { const p = data.progress; if (ref.current && p && !p.completed && p.position_seconds > 2) ref.current.currentTime = p.position_seconds; }}
               onTimeUpdate={() => { markActive(); void save(); }} onPause={() => save(true)} onEnded={() => save(true)}>
          {captionsUrl && <track kind="captions" src={captionsUrl} srcLang="ja" label="Captions" default />}
        </video>
      </div>
      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-2 flex flex-wrap gap-1.5"><span className="chip">{MODULE_LABEL[v.category]}</span><span className="chip !bg-ivory !text-ink">{STYLE_LABEL[v.teaching_style]}</span>
              {v.source === 'ai_generated' && <span className="chip !bg-ivory !text-ink">AI-generated</span>}</div>
            <h1 className="kana text-3xl font-semibold">{v.title}</h1>
          </div>
          {completed && <span className="chip !bg-matcha/15 !text-[#4f6b4c]">✓ Completed</span>}
        </div>
        <p className="kana mt-3 whitespace-pre-line text-ink">{v.description}</p>
        {saveError && <p className="mt-3 text-xs text-beni">Progress couldn’t be saved just now — it will retry while you watch.</p>}
        {data.progress && !data.progress.completed && data.progress.position_seconds > 2 && <p className="mt-3 text-xs text-mist">Resumed from {formatDuration(data.progress.position_seconds)}.</p>}
      </div>
    </div>
  );
}
