import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase, errorMessage } from '../../lib/supabase';
import { useAsync } from '../../hooks/useAsync';
import { findKanji, type KanjiViolation } from '../../lib/kanji';
import { MODULE_LABEL, STYLE_LABEL, type Character, type Lesson, type LessonContent, type Module, type QuizQuestion, type Video, type VideoStyle } from '../../lib/types';
import { EmptyState, ErrorBanner, PageLoader, SuccessBanner } from '../../components/ui';
import { formatDateTime } from '../../lib/format';

const MODULES: Module[] = ['hiragana', 'katakana', 'greetings', 'self_intro', 'business', 'writing'];

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------
export function KanjiReport({ violations }: { violations: KanjiViolation[] }) {
  if (violations.length === 0) return <div className="rounded-2xl bg-matcha/10 px-4 py-2 text-sm text-[#4f6b4c]">✓ No Kanji found — ready to publish.</div>;
  return (
    <div role="alert" className="rounded-2xl border border-beni/30 bg-beni/5 p-4 text-sm text-beni-dark">
      <div className="font-semibold">Kanji found — this content cannot be published.</div>
      <p className="mb-2 text-xs">Rewrite these fields using hiragana, katakana or romaji. Nothing is removed automatically.</p>
      <ul className="space-y-1">{violations.map((v, i) => (
        <li key={i}><code className="rounded bg-white px-1">{v.path}</code> contains <b className="kana text-base">{v.chars.join(' ')}</b> in “<span className="kana">{v.snippet}</span>”</li>
      ))}</ul>
    </div>
  );
}

function StatusChip({ status }: { status: 'draft' | 'published' }) {
  return <span className={`chip ${status === 'published' ? '!bg-matcha/15 !text-[#4f6b4c]' : '!bg-ivory !text-mist'}`}>{status}</span>;
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="block"><span className="label">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-mist">{hint}</span>}</label>;
}

function useSaver() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>, ok: string) => {
    if (busy) return;
    setBusy(true); setErr(null); setMsg(null);
    try { await fn(); setMsg(ok); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };
  return { busy, msg, err, run, setErr };
}

// ---------------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------------
const emptyLesson = (): Partial<Lesson> => ({ slug: '', module: 'greetings', title: '', summary: '', sort_order: 0, status: 'draft', content: { intro: '', items: [] } });

export function LessonsAdmin() {
  const list = useAsync(async () => {
    const { data, error } = await supabase.from('lessons').select('*').order('module').order('sort_order');
    if (error) throw error; return data as Lesson[];
  }, []);
  const [edit, setEdit] = useState<Partial<Lesson> | null>(null);
  if (list.loading && !list.data) return <PageLoader />;
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between"><h1 className="text-3xl font-semibold">Lessons</h1><button className="btn-primary" onClick={() => setEdit(emptyLesson())}>+ New lesson</button></div>
      <ErrorBanner message={list.error} onRetry={list.reload} />
      {edit ? <LessonEditor initial={edit} onClose={() => { setEdit(null); list.reload(); }} /> : (
        <div className="card divide-y divide-blush">
          {list.data?.map((l) => (
            <button key={l.id} onClick={() => setEdit(l)} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-blush-soft">
              <div><div className="font-semibold">{l.title}</div><div className="text-xs text-mist">{MODULE_LABEL[l.module]} · {l.slug} · {l.content.items?.length ?? 0} items</div></div><StatusChip status={l.status} />
            </button>
          ))}
          {list.data?.length === 0 && <div className="p-6 text-mist">No lessons yet.</div>}
        </div>
      )}
    </div>
  );
}

function LessonEditor({ initial, onClose }: { initial: Partial<Lesson>; onClose: () => void }) {
  const [l, setL] = useState<Partial<Lesson>>(initial);
  const [json, setJson] = useState(JSON.stringify(initial.content ?? { items: [] }, null, 2));
  const [jsonErr, setJsonErr] = useState<string | null>(null);
  const s = useSaver();
  const content = useMemo<LessonContent | null>(() => { try { return JSON.parse(json); } catch { return null; } }, [json]);
  useEffect(() => { setJsonErr(content ? null : 'Content is not valid JSON.'); }, [content]);
  const violations = findKanji({ title: l.title, summary: l.summary, content });

  const save = (status: 'draft' | 'published') => s.run(async () => {
    if (!content) throw new Error('Fix the content JSON first.');
    if (!content.items || !Array.isArray(content.items)) throw new Error('Content must have an "items" array.');
    if (!l.title || !l.slug) throw new Error('Title and slug are required.');
    if (status === 'published' && violations.length) throw new Error('Remove all Kanji before publishing.');
    const row = { slug: l.slug, module: l.module, title: l.title, summary: l.summary ?? '', content, sort_order: Number(l.sort_order) || 0, status };
    const q = l.id ? supabase.from('lessons').update(row).eq('id', l.id).select().single() : supabase.from('lessons').insert(row).select().single();
    const { data, error } = await q; if (error) throw error;
    setL(data as Lesson);
  }, status === 'published' ? 'Published.' : 'Saved as draft.');

  const del = () => { if (l.id && confirm('Delete this lesson and all learner progress for it?')) s.run(async () => { const { error } = await supabase.from('lessons').delete().eq('id', l.id!); if (error) throw error; onClose(); }, 'Deleted.'); };

  return (
    <div className="card space-y-4 p-6">
      <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">{l.id ? 'Edit lesson' : 'New lesson'} {l.status && <StatusChip status={l.status} />}</h2><button className="btn-ghost" onClick={onClose}>✕ Close</button></div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Title"><input className="input" value={l.title ?? ''} onChange={(e) => setL({ ...l, title: e.target.value })} /></Field>
        <Field label="Slug" hint="lowercase-with-dashes"><input className="input" value={l.slug ?? ''} onChange={(e) => setL({ ...l, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} /></Field>
        <Field label="Module"><select className="input" value={l.module} onChange={(e) => setL({ ...l, module: e.target.value as Module })}>{MODULES.filter((m) => !['hiragana', 'katakana'].includes(m)).map((m) => <option key={m} value={m}>{MODULE_LABEL[m]}</option>)}</select></Field>
        <Field label="Sort order"><input type="number" className="input" value={l.sort_order ?? 0} onChange={(e) => setL({ ...l, sort_order: Number(e.target.value) })} /></Field>
      </div>
      <Field label="Summary"><input className="input" value={l.summary ?? ''} onChange={(e) => setL({ ...l, summary: e.target.value })} /></Field>
      <Field label="Content (JSON)" hint='{"intro": "...", "items": [{"jp","romaji","en","pronunciation","usage","example":{jp,romaji,en},"conversation":[{speaker,jp,romaji,en}]}], "builder": [{prompt,tiles,answer,romaji,en}]}'>
        <textarea className="input kana min-h-[320px] font-mono text-sm" spellCheck={false} value={json} onChange={(e) => setJson(e.target.value)} />
      </Field>
      <ErrorBanner message={jsonErr} />
      <KanjiReport violations={violations} />
      <SuccessBanner message={s.msg} /><ErrorBanner message={s.err} />
      <div className="flex flex-wrap gap-2">
        <button className="btn-soft" disabled={s.busy} onClick={() => save('draft')}>{l.status === 'published' ? 'Unpublish (save as draft)' : 'Save draft'}</button>
        <button className="btn-primary" disabled={s.busy || violations.length > 0 || !content} onClick={() => save('published')}>Publish</button>
        {l.id && <button className="btn-ghost ml-auto text-beni" disabled={s.busy} onClick={del}>Delete</button>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quizzes
// ---------------------------------------------------------------------------
interface QuizRow { id?: string; slug: string; module: Module; lesson_id: string | null; title: string; questions: QuizQuestion[]; status: 'draft' | 'published' }

export function QuizzesAdmin() {
  const list = useAsync(async () => {
    const [{ data: q, error: e1 }, { data: ls, error: e2 }] = await Promise.all([
      supabase.from('quizzes').select('*').order('module'), supabase.from('lessons').select('id,title').order('title')]);
    if (e1) throw e1; if (e2) throw e2;
    return { quizzes: q as QuizRow[], lessons: ls as { id: string; title: string }[] };
  }, []);
  const [edit, setEdit] = useState<QuizRow | null>(null);
  if (list.loading && !list.data) return <PageLoader />;
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between"><h1 className="text-3xl font-semibold">Quizzes</h1>
        <button className="btn-primary" onClick={() => setEdit({ slug: '', module: 'greetings', lesson_id: null, title: '', questions: [{ prompt: '', choices: ['', '', '', ''], answer: 0 }], status: 'draft' })}>+ New quiz</button></div>
      <ErrorBanner message={list.error} onRetry={list.reload} />
      <p className="text-sm text-mist">Kana character quizzes are generated automatically from the characters table. Answers are graded on the server and never sent to learners in advance.</p>
      {edit ? <QuizEditor initial={edit} lessons={list.data?.lessons ?? []} onClose={() => { setEdit(null); list.reload(); }} /> : (
        <div className="card divide-y divide-blush">
          {list.data?.quizzes.map((q) => (
            <button key={q.id} onClick={() => setEdit(q)} className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-blush-soft">
              <div><div className="font-semibold">{q.title}</div><div className="text-xs text-mist">{MODULE_LABEL[q.module]} · {q.questions.length} questions</div></div><StatusChip status={q.status} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function QuizEditor({ initial, lessons, onClose }: { initial: QuizRow; lessons: { id: string; title: string }[]; onClose: () => void }) {
  const [q, setQ] = useState<QuizRow>(initial);
  const s = useSaver();
  const violations = findKanji({ title: q.title, questions: q.questions });
  const setQuestion = (i: number, patch: Partial<QuizQuestion>) => setQ({ ...q, questions: q.questions.map((x, j) => (j === i ? { ...x, ...patch } : x)) });

  const save = (status: 'draft' | 'published') => s.run(async () => {
    if (!q.title || !q.slug) throw new Error('Title and slug are required.');
    const questions = q.questions.map((x) => ({ ...x, choices: x.choices.filter((c) => c.trim() !== '') }));
    if (status === 'published') {
      if (violations.length) throw new Error('Remove all Kanji before publishing.');
      questions.forEach((x, i) => { if (!x.prompt || x.choices.length < 2 || (x.answer ?? -1) >= x.choices.length) throw new Error(`Question ${i + 1} needs a prompt, 2+ choices and a correct answer.`); });
    }
    const row = { slug: q.slug, module: q.module, lesson_id: q.lesson_id, title: q.title, questions, status };
    const r = q.id ? supabase.from('quizzes').update(row).eq('id', q.id).select().single() : supabase.from('quizzes').insert(row).select().single();
    const { data, error } = await r; if (error) throw error; setQ(data as QuizRow);
  }, status === 'published' ? 'Published.' : 'Saved as draft.');
  const del = () => { if (q.id && confirm('Delete this quiz and its attempts?')) s.run(async () => { const { error } = await supabase.from('quizzes').delete().eq('id', q.id!); if (error) throw error; onClose(); }, 'Deleted.'); };

  return (
    <div className="card space-y-4 p-6">
      <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">{q.id ? 'Edit quiz' : 'New quiz'} <StatusChip status={q.status} /></h2><button className="btn-ghost" onClick={onClose}>✕ Close</button></div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Title"><input className="input" value={q.title} onChange={(e) => setQ({ ...q, title: e.target.value })} /></Field>
        <Field label="Slug"><input className="input" value={q.slug} onChange={(e) => setQ({ ...q, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} /></Field>
        <Field label="Module"><select className="input" value={q.module} onChange={(e) => setQ({ ...q, module: e.target.value as Module })}>{MODULES.map((m) => <option key={m} value={m}>{MODULE_LABEL[m]}</option>)}</select></Field>
        <Field label="Linked lesson"><select className="input" value={q.lesson_id ?? ''} onChange={(e) => setQ({ ...q, lesson_id: e.target.value || null })}><option value="">— none —</option>{lessons.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}</select></Field>
      </div>
      {q.questions.map((x, i) => (
        <fieldset key={i} className="space-y-2 rounded-2xl border border-blush p-4">
          <legend className="px-2 text-sm font-semibold">Question {i + 1}</legend>
          <input className="input kana" placeholder="Prompt" value={x.prompt} onChange={(e) => setQuestion(i, { prompt: e.target.value })} />
          <div className="grid gap-2 sm:grid-cols-2">
            {x.choices.map((c, ci) => (
              <label key={ci} className="flex items-center gap-2">
                <input type="radio" name={`ans-${i}`} checked={x.answer === ci} onChange={() => setQuestion(i, { answer: ci })} aria-label={`Choice ${ci + 1} is correct`} />
                <input className="input kana !py-2" placeholder={`Choice ${ci + 1}`} value={c} onChange={(e) => setQuestion(i, { choices: x.choices.map((y, k) => (k === ci ? e.target.value : y)) })} />
              </label>
            ))}
          </div>
          <div className="flex justify-between text-xs"><span className="text-mist">Select the radio button next to the correct answer.</span>
            <button className="text-beni" onClick={() => setQ({ ...q, questions: q.questions.filter((_, j) => j !== i) })}>Remove question</button></div>
        </fieldset>
      ))}
      <button className="btn-soft" onClick={() => setQ({ ...q, questions: [...q.questions, { prompt: '', choices: ['', '', '', ''], answer: 0 }] })}>+ Add question</button>
      <KanjiReport violations={violations} />
      <SuccessBanner message={s.msg} /><ErrorBanner message={s.err} />
      <div className="flex flex-wrap gap-2">
        <button className="btn-soft" disabled={s.busy} onClick={() => save('draft')}>{q.status === 'published' ? 'Unpublish (save as draft)' : 'Save draft'}</button>
        <button className="btn-primary" disabled={s.busy || violations.length > 0} onClick={() => save('published')}>Publish</button>
        {q.id && <button className="btn-ghost ml-auto text-beni" onClick={del}>Delete</button>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Videos: manual upload, external URL, or AI generation via a configured provider
// ---------------------------------------------------------------------------
const emptyVideo = (): Partial<Video> => ({ title: '', description: '', category: 'hiragana', teaching_style: 'animated_teacher', source: 'upload', captions_vtt: '', sort_order: 0, status: 'draft', generation: {} });

export function VideosAdmin() {
  const list = useAsync(async () => { const { data, error } = await supabase.from('videos').select('*').order('category').order('sort_order'); if (error) throw error; return data as Video[]; }, []);
  const [edit, setEdit] = useState<Partial<Video> | null>(null);
  if (list.loading && !list.data) return <PageLoader />;
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between"><h1 className="text-3xl font-semibold">Videos</h1><button className="btn-primary" onClick={() => setEdit(emptyVideo())}>+ Add video</button></div>
      <ErrorBanner message={list.error} onRetry={list.reload} />
      {edit ? <VideoEditor initial={edit} onClose={() => { setEdit(null); list.reload(); }} /> : list.data?.length === 0 ? (
        <EmptyState icon="🎬" title="No videos yet">Upload a generated lesson video, link one hosted elsewhere, or request one from your AI video provider. Learners only see published videos with real media.</EmptyState>
      ) : (
        <div className="card divide-y divide-blush">
          {list.data?.map((v) => (
            <button key={v.id} onClick={() => setEdit(v)} className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-blush-soft">
              <div><div className="kana font-semibold">{v.title}</div><div className="text-xs text-mist">{MODULE_LABEL[v.category]} · {STYLE_LABEL[v.teaching_style]} · {v.source}{typeof v.generation?.state === 'string' ? ` · generation: ${v.generation.state}` : ''}</div></div>
              <StatusChip status={v.status} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function probeDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const el = document.createElement('video');
    el.preload = 'metadata';
    el.onloadedmetadata = () => { URL.revokeObjectURL(el.src); resolve(Number.isFinite(el.duration) ? Math.round(el.duration) : null); };
    el.onerror = () => resolve(null);
    el.src = URL.createObjectURL(file);
  });
}

function VideoEditor({ initial, onClose }: { initial: Partial<Video>; onClose: () => void }) {
  const [v, setV] = useState<Partial<Video>>(initial);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [script, setScript] = useState<string>(typeof initial.generation?.script === 'string' ? (initial.generation.script as string) : '');
  const [progress, setProgress] = useState<string | null>(null);
  const s = useSaver();
  const violations = findKanji({ title: v.title, description: v.description, captions: v.captions_vtt, script });
  const hasMedia = Boolean(videoFile || v.storage_path || v.external_url);

  const upload = async (file: File, folder: string) => {
    const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    const path = `${folder}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('media').upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    return path;
  };

  const save = (status: 'draft' | 'published') => s.run(async () => {
    if (!v.title) throw new Error('Title is required.');
    if (status === 'published' && violations.length) throw new Error('Remove all Kanji before publishing.');
    if (status === 'published' && !hasMedia) throw new Error('Upload a video file or add an https URL before publishing. Placeholder videos cannot be published.');
    if (v.captions_vtt && !v.captions_vtt.trimStart().startsWith('WEBVTT')) throw new Error('Captions must be WebVTT (start with "WEBVTT").');
    if (v.external_url && !/^https:\/\//.test(v.external_url)) throw new Error('External URL must start with https://');
    const row: Partial<Video> = { ...v, generation: { ...(v.generation ?? {}), ...(script ? { script } : {}) } };
    if (videoFile) {
      setProgress('Uploading video…');
      row.storage_path = await upload(videoFile, 'videos');
      row.duration_seconds = (await probeDuration(videoFile)) ?? row.duration_seconds ?? null;
      if (row.source !== 'ai_generated') row.source = 'upload';
    }
    if (thumbFile) { setProgress('Uploading thumbnail…'); row.thumbnail_path = await upload(thumbFile, 'thumbnails'); }
    setProgress('Saving…');
    const { id, created_at: _c, updated_at: _u, published_at: _p, ...fields } = row as Video & { created_at?: string; updated_at?: string; published_at?: string };
    void _c; void _u; void _p;
    const body = { ...fields, status };
    const r = id ? supabase.from('videos').update(body).eq('id', id).select().single() : supabase.from('videos').insert(body).select().single();
    const { data, error } = await r;
    setProgress(null);
    if (error) throw error;
    setV(data as Video); setVideoFile(null); setThumbFile(null);
  }, status === 'published' ? 'Published.' : 'Saved as draft.');

  const generate = () => s.run(async () => {
    if (!v.title || !script.trim()) throw new Error('Add a title and a teaching script first.');
    if (violations.length) throw new Error('Remove all Kanji from the script and captions first.');
    const { data, error } = await supabase.functions.invoke('generate-video', {
      body: { video_id: v.id ?? null, title: v.title, description: v.description, category: v.category, teaching_style: v.teaching_style, script, captions_vtt: v.captions_vtt },
    });
    if (error) throw error;
    setV(data.video as Video);
  }, 'Generation requested. The video stays a draft until the provider delivers it and you review and publish it.');

  const del = () => { if (v.id && confirm('Delete this video?')) s.run(async () => {
    const { error } = await supabase.from('videos').delete().eq('id', v.id!); if (error) throw error;
    const paths = [v.storage_path, v.thumbnail_path].filter(Boolean) as string[];
    if (paths.length) await supabase.storage.from('media').remove(paths);
    onClose();
  }, 'Deleted.'); };

  const readVtt = async (f: File) => setV({ ...v, captions_vtt: await f.text() });

  return (
    <div className="card space-y-4 p-6">
      <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">{v.id ? 'Edit video' : 'New video'} {v.status && <StatusChip status={v.status} />}</h2><button className="btn-ghost" onClick={onClose}>✕ Close</button></div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Title"><input className="input kana" value={v.title ?? ''} onChange={(e) => setV({ ...v, title: e.target.value })} /></Field>
        <Field label="Category"><select className="input" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value as Module })}>{MODULES.map((m) => <option key={m} value={m}>{MODULE_LABEL[m]}</option>)}</select></Field>
        <Field label="Teaching style"><select className="input" value={v.teaching_style} onChange={(e) => setV({ ...v, teaching_style: e.target.value as VideoStyle })}>{(Object.keys(STYLE_LABEL) as VideoStyle[]).map((k) => <option key={k} value={k}>{STYLE_LABEL[k]}</option>)}</select></Field>
        <Field label="Sort order"><input type="number" className="input" value={v.sort_order ?? 0} onChange={(e) => setV({ ...v, sort_order: Number(e.target.value) })} /></Field>
      </div>
      <Field label="Description"><textarea className="input kana min-h-20" value={v.description ?? ''} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>

      <div className="grid gap-4 rounded-2xl bg-blush-soft p-4 md:grid-cols-3">
        <Field label="Video file (MP4/WebM)" hint={v.storage_path ? `Current: ${v.storage_path}` : 'Stored in the private media bucket'}>
          <input type="file" accept="video/mp4,video/webm" className="text-sm" onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)} /></Field>
        <Field label="…or external https URL"><input className="input" placeholder="https://…" value={v.external_url ?? ''} onChange={(e) => setV({ ...v, external_url: e.target.value || null, source: e.target.value ? 'external' : v.source })} /></Field>
        <Field label="Thumbnail image" hint={v.thumbnail_path ? `Current: ${v.thumbnail_path}` : undefined}><input type="file" accept="image/png,image/jpeg,image/webp" className="text-sm" onChange={(e) => setThumbFile(e.target.files?.[0] ?? null)} /></Field>
      </div>

      <Field label="Captions (WebVTT)" hint="Paste or load a .vtt file. Captions are checked for Kanji before publishing.">
        <textarea className="input kana min-h-28 font-mono text-sm" value={v.captions_vtt ?? ''} onChange={(e) => setV({ ...v, captions_vtt: e.target.value })} placeholder={'WEBVTT\n\n00:00.000 --> 00:03.000\nこんにちは！'} />
      </Field>
      <input type="file" accept=".vtt,text/vtt" className="text-sm" onChange={(e) => e.target.files?.[0] && readVtt(e.target.files[0])} aria-label="Load captions file" />

      <details className="rounded-2xl border border-blush p-4">
        <summary className="cursor-pointer font-semibold">AI video generation</summary>
        <p className="mt-2 text-sm text-mist">Sends this script to the provider configured in the <code>generate-video</code> edge function (see README). If no provider is configured, generate the video elsewhere and upload it above.</p>
        <textarea className="input kana mt-3 min-h-28" placeholder="Teaching script in kana, romaji and English…" value={script} onChange={(e) => setScript(e.target.value)} />
        {typeof v.generation?.state === 'string' && <p className="mt-2 text-sm">Status: <b>{v.generation.state as string}</b>{v.generation.updated_at ? ` · ${formatDateTime(v.generation.updated_at as string)}` : ''}{v.generation.error ? ` · ${v.generation.error}` : ''}</p>}
        <button className="btn-soft mt-3" disabled={s.busy} onClick={generate}>Request generation</button>
      </details>

      <KanjiReport violations={violations} />
      {progress && <p className="text-sm text-mist">{progress}</p>}
      <SuccessBanner message={s.msg} /><ErrorBanner message={s.err} />
      <div className="flex flex-wrap gap-2">
        <button className="btn-soft" disabled={s.busy} onClick={() => save('draft')}>{v.status === 'published' ? 'Unpublish (save as draft)' : 'Save draft'}</button>
        <button className="btn-primary" disabled={s.busy || violations.length > 0 || !hasMedia} onClick={() => save('published')} title={!hasMedia ? 'Add real media first' : undefined}>Publish</button>
        {v.id && <button className="btn-ghost ml-auto text-beni" onClick={del}>Delete</button>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Characters & audio
// ---------------------------------------------------------------------------
export function CharactersAdmin() {
  const list = useAsync(async () => { const { data, error } = await supabase.from('characters').select('id,script,char,romaji,example_word,example_romaji,example_meaning,pronunciation,audio_path,status,sort_order').order('script').order('sort_order'); if (error) throw error; return data as unknown as Character[]; }, []);
  const [sel, setSel] = useState<Character | null>(null);
  const s = useSaver();
  const [audio, setAudio] = useState<File | null>(null);
  if (list.loading && !list.data) return <PageLoader />;
  const violations = sel ? findKanji({ pronunciation: sel.pronunciation, example_word: sel.example_word, example_romaji: sel.example_romaji, example_meaning: sel.example_meaning }) : [];

  const save = () => sel && s.run(async () => {
    if (violations.length) throw new Error('Remove all Kanji first.');
    let audio_path = sel.audio_path;
    if (audio) {
      const ext = audio.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp3';
      audio_path = `audio/${sel.script}/${sel.romaji}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      const { error } = await supabase.storage.from('media').upload(audio_path, audio, { contentType: audio.type });
      if (error) throw error;
    }
    const { error } = await supabase.from('characters').update({ pronunciation: sel.pronunciation, example_word: sel.example_word, example_romaji: sel.example_romaji, example_meaning: sel.example_meaning, audio_path }).eq('id', sel.id);
    if (error) throw error;
    setAudio(null); setSel({ ...sel, audio_path }); list.reload();
  }, 'Saved.');

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-semibold">Characters & audio</h1>
      <p className="text-sm text-mist">Upload native recordings to replace the device-voice fallback. Stroke data comes from KanjiVG and is not edited here.</p>
      <ErrorBanner message={list.error} onRetry={list.reload} />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="card grid grid-cols-6 gap-1.5 p-4 sm:grid-cols-10 lg:grid-cols-12">
          {list.data?.map((c) => (
            <button key={c.id} onClick={() => { setSel(c); setAudio(null); }} className={`kana relative aspect-square rounded-lg text-xl transition ${sel?.id === c.id ? 'bg-beni text-white' : 'bg-ivory hover:bg-blush'}`}>
              {c.char}{c.audio_path && <span className="absolute right-0.5 top-0 text-[9px]">🔊</span>}
            </button>
          ))}
        </div>
        {sel && (
          <div className="card space-y-3 p-5">
            <div className="kana text-6xl">{sel.char} <span className="text-xl text-mist">{sel.romaji}</span></div>
            {(['pronunciation', 'example_word', 'example_romaji', 'example_meaning'] as const).map((k) => (
              <Field key={k} label={k.replace('_', ' ')}><input className="input kana !py-2" value={sel[k]} onChange={(e) => setSel({ ...sel, [k]: e.target.value })} /></Field>
            ))}
            <Field label="Audio recording" hint={sel.audio_path ? `Current: ${sel.audio_path}` : 'None — device voice is used'}><input type="file" accept="audio/*" className="text-sm" onChange={(e) => setAudio(e.target.files?.[0] ?? null)} /></Field>
            {sel.audio_path && <button className="text-xs text-beni" onClick={() => setSel({ ...sel, audio_path: null })}>Remove recording (use device voice)</button>}
            <KanjiReport violations={violations} />
            <SuccessBanner message={s.msg} /><ErrorBanner message={s.err} />
            <button className="btn-primary" disabled={s.busy || violations.length > 0} onClick={save}>Save</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------
export function AuditLog() {
  const list = useAsync(async () => {
    const { data, error } = await supabase.from('admin_audit_logs').select('id,action,entity_type,entity_id,created_at,after,before').order('created_at', { ascending: false }).limit(200);
    if (error) throw error; return data as { id: string; action: string; entity_type: string; entity_id: string; created_at: string; after: Record<string, unknown> | null; before: Record<string, unknown> | null }[];
  }, []);
  if (list.loading && !list.data) return <PageLoader />;
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-semibold">Audit log</h1>
      <p className="text-sm text-mist">Every owner change to content and accounts is recorded automatically by the database. Entries cannot be edited or deleted from the app.</p>
      <ErrorBanner message={list.error} onRetry={list.reload} />
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm"><thead><tr className="text-left text-xs uppercase text-mist"><th className="px-4 py-3">When</th><th>Action</th><th>Entity</th><th>Summary</th></tr></thead>
          <tbody>{list.data?.map((a) => {
            const rec = a.after ?? a.before ?? {};
            const label = (rec.title ?? rec.full_name ?? rec.char ?? rec.slug ?? a.entity_id) as string;
            const change = a.action === 'update' && a.before && a.after && a.before.status !== a.after.status ? ` (${a.before.status} → ${a.after.status})` : '';
            return <tr key={a.id} className="border-t border-blush"><td className="px-4 py-2">{formatDateTime(a.created_at)}</td><td>{a.action}</td><td>{a.entity_type}</td><td className="kana">{label}{change}</td></tr>;
          })}</tbody></table>
      </div>
    </div>
  );
}
