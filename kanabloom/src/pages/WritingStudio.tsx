import { useState } from 'react';
import { fetchCharacters } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useAsync } from '../hooks/useAsync';
import type { Script } from '../lib/types';
import { WritingCanvas } from '../components/WritingCanvas';
import { StrokeOrder } from '../components/StrokeOrder';
import { ErrorBanner, PageLoader, SectionTitle } from '../components/ui';
import { formatDateTime } from '../lib/format';

export default function WritingStudio() {
  const [script, setScript] = useState<Script>('hiragana');
  const chars = useAsync(() => fetchCharacters(script), [script]);
  const [sel, setSel] = useState(0);
  const history = useAsync(async () => {
    const { data, error } = await supabase.from('writing_attempts').select('id,accuracy,mode,created_at,characters(char,script)').order('created_at', { ascending: false }).limit(20);
    if (error) throw error;
    return data as unknown as { id: string; accuracy: number; mode: string; created_at: string; characters: { char: string; script: string } }[];
  }, []);

  const list = chars.data ?? [];
  const c = list[Math.min(sel, list.length - 1)];

  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="かく" title="Writing Practice Studio">Pick a character, watch the stroke order, then trace or write it from memory. Works with mouse, finger and stylus.</SectionTitle>
      <div className="inline-flex rounded-full bg-blush p-1">
        {(['hiragana', 'katakana'] as Script[]).map((s) => (
          <button key={s} onClick={() => { setScript(s); setSel(0); }} className={`rounded-full px-5 py-2 text-sm font-medium capitalize ${script === s ? 'bg-white text-beni shadow' : 'text-ink'}`}>{s}</button>
        ))}
      </div>
      {chars.error && <ErrorBanner message={chars.error} onRetry={chars.reload} />}
      {chars.loading && !chars.data ? <PageLoader /> : c && (
        <>
          <div className="card flex gap-1.5 overflow-x-auto p-3" role="listbox" aria-label="Choose a character">
            {list.map((x, i) => (
              <button key={x.id} role="option" aria-selected={i === sel} onClick={() => setSel(i)}
                      className={`kana h-12 w-12 shrink-0 rounded-xl text-2xl transition ${i === sel ? 'bg-beni text-white' : 'hover:bg-blush'}`}>{x.char}</button>
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
            <div className="card flex flex-col items-center gap-2 p-6">
              <div className="kana text-6xl">{c.char}</div><div className="font-display text-xl text-beni">{c.romaji}</div>
              <StrokeOrder paths={c.stroke_paths} size={200} />
            </div>
            <div className="card p-6"><WritingCanvas character={c} onSaved={() => history.reload()} /></div>
          </div>
        </>
      )}
      <section className="card p-6">
        <h2 className="mb-3 text-xl font-semibold">Practice history</h2>
        {history.error && <ErrorBanner message={history.error} onRetry={history.reload} />}
        {history.data && history.data.length === 0 && <p className="text-sm text-mist">Your saved attempts will appear here.</p>}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {history.data?.map((h) => (
            <div key={h.id} className="flex items-center gap-3 rounded-2xl bg-blush-soft p-3">
              <span className="kana text-3xl">{h.characters?.char}</span>
              <div className="text-sm"><div className="font-semibold">{h.accuracy}% <span className="font-normal text-mist">· {h.mode === 'trace' ? 'traced' : 'memory'}</span></div><div className="text-xs text-mist">{formatDateTime(h.created_at)}</div></div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
