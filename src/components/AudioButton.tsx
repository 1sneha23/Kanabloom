import { useState } from 'react';
import { playRecordingOrSpeak, speechAvailable } from '../lib/audio';

export function AudioButton({ text, audioPath, label = 'Listen', small = false }: { text: string; audioPath?: string | null; label?: string; small?: boolean }) {
  const [state, setState] = useState<'idle' | 'playing' | 'error'>('idle');
  const [source, setSource] = useState<'recording' | 'device' | null>(null);
  const supported = Boolean(audioPath) || speechAvailable();

  const play = async () => {
    setState('playing');
    try {
      setSource(await playRecordingOrSpeak(text, audioPath));
      setState('idle');
    } catch {
      setState('error');
    }
  };

  if (!supported) return <span className="text-xs text-mist">Audio not supported in this browser</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={play} disabled={state === 'playing'} aria-label={`${label}: ${text}`}
              className={`btn-soft ${small ? '!px-3 !py-1 text-xs' : '!py-2 text-sm'}`}>
        <span aria-hidden>{state === 'playing' ? '◉' : '🔊'}</span>{!small && label}
      </button>
      {state === 'error' && <span className="text-xs text-beni">Couldn’t play audio. Check your device has a Japanese voice.</span>}
      {source === 'device' && !small && <span className="text-xs text-mist" title="No recording uploaded yet; using your device's Japanese voice.">device voice</span>}
    </span>
  );
}
