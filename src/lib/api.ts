import { supabase } from './supabase';
import type { Character, CharacterProgress, Lesson, Module, Script, Video } from './types';

const CHAR_COLS = 'id,script,char,romaji,row_label,sort_order,pronunciation,example_word,example_romaji,example_meaning,stroke_count,stroke_paths,stroke_points,audio_path';

export async function fetchCharacters(script: Script): Promise<Character[]> {
  const { data, error } = await supabase.from('characters').select(CHAR_COLS).eq('script', script).eq('status', 'published').order('sort_order');
  if (error) throw error;
  return data as Character[];
}

export async function fetchMyCharacterProgress(): Promise<Map<string, CharacterProgress>> {
  // RLS returns only the signed-in learner's rows.
  const { data, error } = await supabase.from('student_character_progress')
    .select('character_id,first_viewed_at,quiz_attempts,quiz_correct,writing_attempts,best_writing_accuracy,mastered');
  if (error) throw error;
  return new Map((data as CharacterProgress[]).map((p) => [p.character_id, p]));
}

export async function fetchLessons(module: Module): Promise<Lesson[]> {
  const { data, error } = await supabase.from('lessons').select('*').eq('module', module).eq('status', 'published').order('sort_order');
  if (error) throw error;
  return data as Lesson[];
}

export async function fetchMyLessonProgress(): Promise<Map<string, { progress_pct: number; completed: boolean }>> {
  const { data, error } = await supabase.from('student_lesson_progress').select('lesson_id,progress_pct,completed');
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.lesson_id as string, { progress_pct: r.progress_pct as number, completed: r.completed as boolean }]));
}

export async function fetchPublishedVideos(): Promise<Video[]> {
  const { data, error } = await supabase.from('videos').select('*').eq('status', 'published').order('category').order('sort_order');
  if (error) throw error;
  return data as Video[];
}

export async function fetchMyVideoProgress(): Promise<Map<string, { position_seconds: number; completed: boolean; max_position_seconds: number; duration_seconds: number | null }>> {
  const { data, error } = await supabase.from('video_progress').select('video_id,position_seconds,max_position_seconds,duration_seconds,completed');
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.video_id as string, {
    position_seconds: Number(r.position_seconds), max_position_seconds: Number(r.max_position_seconds),
    duration_seconds: r.duration_seconds === null ? null : Number(r.duration_seconds), completed: r.completed as boolean,
  }]));
}

export interface QuizListItem { id: string; slug: string; module: Module; lesson_id: string | null; title: string; question_count: number }
export async function fetchQuizList(): Promise<QuizListItem[]> {
  const { data, error } = await supabase.rpc('list_quizzes');
  if (error) throw error;
  return data as QuizListItem[];
}
