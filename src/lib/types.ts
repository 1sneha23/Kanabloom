export type Role = 'admin' | 'learner';
export type Module = 'hiragana' | 'katakana' | 'greetings' | 'self_intro' | 'business' | 'writing';
export type Script = 'hiragana' | 'katakana';
export type VideoStyle = 'animated_teacher' | 'ai_human_teacher' | 'animated_characters';

export interface Profile {
  id: string; student_id: string; full_name: string; email: string; role: Role;
  status: 'active' | 'suspended'; timezone: string; registered_at: string;
  last_login_at: string | null; last_activity_at: string | null;
}

export interface Character {
  id: string; script: Script; char: string; romaji: string; row_label: string; sort_order: number;
  pronunciation: string; example_word: string; example_romaji: string; example_meaning: string;
  stroke_count: number; stroke_paths: string[]; stroke_points: [number, number][][]; audio_path: string | null;
}

export interface CharacterProgress {
  character_id: string; first_viewed_at: string | null; quiz_attempts: number; quiz_correct: number;
  writing_attempts: number; best_writing_accuracy: number; mastered: boolean;
}

export interface Line { speaker?: string; jp: string; romaji: string; en: string }
export interface PhraseItem { jp: string; romaji: string; en: string; pronunciation?: string; usage?: string; example?: Line; conversation?: Line[] }
export interface SentenceBuilder { prompt: string; tiles: string[]; answer: string[]; romaji: string; en: string }
export interface LessonContent { intro?: string; items: PhraseItem[]; builder?: SentenceBuilder[] }

export interface Lesson {
  id: string; slug: string; module: Module; title: string; summary: string; content: LessonContent;
  audio_path: string | null; sort_order: number; status: 'draft' | 'published';
}

export interface QuizQuestion { prompt: string; choices: string[]; answer?: number; explanation?: string }
export interface PublicQuiz { id: string; slug: string; module: Module; lesson_id: string | null; title: string; questions: QuizQuestion[] }

export interface Video {
  id: string; title: string; description: string; category: Module; teaching_style: VideoStyle;
  source: 'upload' | 'ai_generated' | 'external'; storage_path: string | null; external_url: string | null;
  thumbnail_path: string | null; captions_vtt: string; duration_seconds: number | null;
  generation: Record<string, unknown>; sort_order: number; status: 'draft' | 'published';
}

export interface DashboardStats {
  hiragana: { total: number; mastered: number }; katakana: { total: number; mastered: number };
  lessons: { total: number; completed: number }; videos: { total: number; completed: number };
  overall_pct: number; total_seconds: number; streak_days: number;
  avg_quiz_pct: number | null; avg_writing_accuracy: number | null; today: string;
}

export const MODULE_LABEL: Record<Module, string> = {
  hiragana: 'Hiragana', katakana: 'Katakana', greetings: 'Greetings',
  self_intro: 'Self-introduction', business: 'Business Japanese', writing: 'Writing practice',
};
export const STYLE_LABEL: Record<VideoStyle, string> = {
  animated_teacher: 'Animated teacher', ai_human_teacher: 'Human-like AI teacher', animated_characters: 'Animated characters',
};
