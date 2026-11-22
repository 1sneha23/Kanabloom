import { supabase } from './supabase';

// Audio: plays an owner-uploaded recording when one exists (audio_path in the private media bucket);
// otherwise falls back to the device's built-in Japanese voice via the Web Speech API.
// The UI labels which one is playing so learners know whether it is a recording or a device voice.

let cachedVoice: SpeechSynthesisVoice | null | undefined;

function japaneseVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  if (cachedVoice !== undefined && cachedVoice !== null) return cachedVoice;
  const voices = window.speechSynthesis.getVoices();
  cachedVoice = voices.find((v) => v.lang === 'ja-JP') ?? voices.find((v) => v.lang.startsWith('ja')) ?? null;
  return cachedVoice;
}

export function speechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function hasJapaneseVoice(): boolean {
  return japaneseVoice() !== null;
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => { cachedVoice = undefined; };
}

export function speak(text: string, rate = 0.8): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!speechAvailable()) { reject(new Error('Audio is not supported in this browser.')); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/\[name\]/g, ''));
    u.lang = 'ja-JP';
    u.rate = rate;
    const v = japaneseVoice();
    if (v) u.voice = v;
    u.onend = () => resolve();
    u.onerror = (e) => (e.error === 'interrupted' || e.error === 'canceled' ? resolve() : reject(new Error('Could not play audio.')));
    window.speechSynthesis.speak(u);
  });
}

const urlCache = new Map<string, { url: string; exp: number }>();
export async function signedMediaUrl(path: string, ttlSeconds = 3600): Promise<string> {
  const hit = urlCache.get(path);
  if (hit && hit.exp > Date.now() + 60_000) return hit.url;
  const { data, error } = await supabase.storage.from('media').createSignedUrl(path, ttlSeconds);
  if (error || !data) throw error ?? new Error('Could not load media');
  urlCache.set(path, { url: data.signedUrl, exp: Date.now() + ttlSeconds * 1000 });
  return data.signedUrl;
}

export async function playRecordingOrSpeak(text: string, audioPath?: string | null): Promise<'recording' | 'device'> {
  if (audioPath) {
    try {
      const url = await signedMediaUrl(audioPath);
      await new Audio(url).play();
      return 'recording';
    } catch { /* fall through to device voice */ }
  }
  await speak(text);
  return 'device';
}
