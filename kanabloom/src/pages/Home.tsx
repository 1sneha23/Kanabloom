import { Link } from 'react-router-dom';
import { Blossom, FallingPetals, HeroArt } from '../components/Brand';
import { ProgressRing, SectionTitle } from '../components/ui';
import { StrokeOrder } from '../components/StrokeOrder';
import strokes from '../content/kana-strokes.json';

// The homepage is public and does not query the database. The writing preview uses the
// same KanjiVG stroke data that is seeded into the characters table.
const S = strokes as Record<string, string[]>;

const modules = [
  { kana: 'あ', title: 'Hiragana', text: 'All 46 basic characters with stroke order, audio, examples and writing practice.', to: '/learn/hiragana', tag: '46 characters' },
  { kana: 'ア', title: 'Katakana', text: 'The script for loanwords and names — tracked separately so you see real progress.', to: '/learn/katakana', tag: '46 characters' },
  { kana: 'こんにちは', title: 'Greetings', text: 'Ten everyday expressions with pronunciation, usage notes and short conversations.', to: '/learn/greetings', tag: '10 expressions' },
  { kana: 'はじめまして', title: 'Self-introduction', text: 'Name, nationality, job, hobbies and a polite closing — plus a sentence builder.', to: '/learn/self-intro', tag: 'Sentence builder' },
  { kana: 'かいしゃ', title: 'Business Japanese', text: 'Core workplace words, polite office phrases and a business-card dialogue.', to: '/learn/business', tag: 'Vocabulary + dialogue' },
  { kana: '✍', title: 'Writing Studio', text: 'Trace or write from memory with mouse, finger or stylus and get instant feedback.', to: '/writing', tag: 'Touch & stylus' },
];

const videoStyles = [
  { title: 'Animated teacher', text: 'A friendly illustrated sensei walks you through each row of characters.', hue: 'from-blush to-sakura/40' },
  { title: 'Human-like AI teacher', text: 'Natural pronunciation and mouth shapes to imitate, with captions.', hue: 'from-ivory to-blush' },
  { title: 'Animated characters', text: 'Short scenes with text and voice that show phrases in real situations.', hue: 'from-sakura/30 to-blush-soft' },
];

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <FallingPetals />
        <div className="absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-blush/70 blur-3xl" aria-hidden />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 pb-16 pt-14 md:grid-cols-2 md:pt-20">
          <div className="animate-rise">
            <span className="chip mb-5">✿ 100% free · No Kanji · Beginner friendly</span>
            <h1 className="text-5xl font-semibold leading-[1.05] md:text-6xl lg:text-7xl">
              Your Japanese Journey <span className="text-beni">Starts Here.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-ink">
              Discover Japanese writing and basic communication through interactive lessons, guided writing and engaging AI-powered videos.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/register" className="btn-primary !px-7 !py-3.5 text-lg">Start Learning for Free</Link>
              <Link to="/login" className="btn-soft !px-7 !py-3.5 text-lg">I have an account</Link>
            </div>
            <div className="mt-8 flex items-center gap-6 text-sm text-mist">
              <span><b className="text-charcoal">92</b> kana</span><span><b className="text-charcoal">5</b> learning paths</span><span><b className="text-charcoal">Free</b> forever</span>
            </div>
          </div>
          <div className="relative mx-auto aspect-square w-full max-w-md">
            <HeroArt />
          </div>
        </div>
      </section>

      {/* About */}
      <section id="about" className="mx-auto max-w-7xl scroll-mt-24 px-5 py-16">
        <div className="grid gap-10 md:grid-cols-2 md:items-center">
          <SectionTitle eyebrow="About KanaBloom" title="Learn the sounds and scripts first.">
            KanaBloom focuses on what beginners actually need: reading and writing hiragana and katakana, and saying the
            phrases you will use on day one. There is no Kanji — so you build confidence one character at a time.
          </SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            {[['🌱', 'Start from zero', 'No prior Japanese needed.'], ['🎧', 'Hear every sound', 'Audio for every character and phrase.'],
              ['✍️', 'Write by hand', 'Stroke-by-stroke guidance.'], ['📈', 'See your growth', 'Progress saved to your account.']].map(([i, t, d]) => (
              <div key={t} className="card p-5"><div className="text-2xl" aria-hidden>{i}</div><div className="mt-2 font-semibold">{t}</div><div className="text-sm text-mist">{d}</div></div>
            ))}
          </div>
        </div>
      </section>

      {/* Modules */}
      <section id="modules" className="scroll-mt-24 bg-white/60 py-16">
        <div className="mx-auto max-w-7xl px-5">
          <SectionTitle eyebrow="Learning modules" title="Six paths, one gentle journey." />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((m) => (
              <Link key={m.title} to={m.to} className="card group relative overflow-hidden p-6 transition hover:-translate-y-1 hover:shadow-[var(--shadow-lift)]">
                <Blossom size={90} className="absolute -right-6 -top-6 opacity-20 transition-transform duration-700 group-hover:rotate-45" />
                <div className="kana mb-4 text-4xl text-beni">{m.kana}</div>
                <h3 className="text-xl font-semibold">{m.title}</h3>
                <p className="mt-1.5 text-sm text-ink">{m.text}</p>
                <span className="chip mt-4">{m.tag}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Videos */}
      <section id="videos" className="mx-auto max-w-7xl scroll-mt-24 px-5 py-16">
        <SectionTitle eyebrow="Video learning centre" title="Three ways to learn by watching.">
          Lessons are taught in three styles. Videos are added by the KanaBloom team and appear in your library as they are published.
        </SectionTitle>
        <div className="grid gap-5 md:grid-cols-3">
          {videoStyles.map((v) => (
            <div key={v.title} className="card overflow-hidden">
              <div className={`flex aspect-video items-center justify-center bg-gradient-to-br ${v.hue}`}>
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-beni shadow" aria-hidden>▶</div>
              </div>
              <div className="p-5"><h3 className="text-lg font-semibold">{v.title}</h3><p className="mt-1 text-sm text-ink">{v.text}</p></div>
            </div>
          ))}
        </div>
      </section>

      {/* Writing + progress preview */}
      <section id="progress" className="scroll-mt-24 bg-white/60 py-16">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 md:grid-cols-2">
          <div className="card p-8">
            <SectionTitle eyebrow="Writing practice" title="Watch, trace, then write." />
            <div className="flex flex-wrap items-center gap-8">
              <StrokeOrder paths={S['き']} size={190} />
              <div className="space-y-2 text-sm text-ink">
                <div className="kana text-5xl text-charcoal">き <span className="text-2xl text-mist">ki</span></div>
                <p>Numbered strokes show the order.<br />Trace over the guide, then try from memory.</p>
              </div>
            </div>
          </div>
          <div className="card p-8">
            <SectionTitle eyebrow="Progress tracking" title="Every petal counts." />
            <div className="flex flex-wrap items-center gap-8">
              <ProgressRing value={64} label="64%" sublabel="Hiragana" />
              <ProgressRing value={28} label="28%" sublabel="Katakana" color="var(--color-sakura-deep)" />
              <ul className="space-y-1.5 text-sm text-ink">
                <li>🔥 Daily streaks</li><li>⏱ Real active study time</li><li>🏅 Achievements</li><li>📊 Quiz & writing trends</li>
              </ul>
            </div>
            <p className="mt-4 text-xs text-mist">Example preview — your own dashboard shows your real progress.</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-4xl px-5 py-20 text-center">
        <Blossom size={56} className="mx-auto" />
        <h2 className="mt-4 text-4xl font-semibold">Ready to bloom?</h2>
        <p className="mt-3 text-ink">Create a free account and save your progress across devices.</p>
        <Link to="/register" className="btn-primary mt-8 !px-8 !py-3.5 text-lg">Start Learning for Free</Link>
      </section>
    </>
  );
}
