import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { RequireAdmin, RequireLearner } from './auth/Guards';
import { AppLayout, PublicLayout } from './components/Layout';
import { PageLoader } from './components/ui';
import Home from './pages/Home';
import { ForgotPassword, Login, Register, ResetPassword, Suspended, VerifyEmail } from './pages/Auth';

// Learner and admin areas are code-split so the public homepage loads fast.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const KanaModulePage = lazy(() => import('./pages/KanaModule').then((m) => ({ default: m.KanaModule })));
const CharacterDetail = lazy(() => import('./pages/KanaModule').then((m) => ({ default: m.CharacterDetail })));
const PhraseModule = lazy(() => import('./pages/PhraseModule'));
const WritingStudio = lazy(() => import('./pages/WritingStudio'));
const VideoLibrary = lazy(() => import('./pages/Videos').then((m) => ({ default: m.VideoLibrary })));
const VideoPlayer = lazy(() => import('./pages/Videos').then((m) => ({ default: m.VideoPlayer })));
const Profile = lazy(() => import('./pages/Profile'));
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const AdminOverview = lazy(() => import('./pages/admin/Overview'));
const Students = lazy(() => import('./pages/admin/Students').then((m) => ({ default: m.Students })));
const StudentReport = lazy(() => import('./pages/admin/Students').then((m) => ({ default: m.StudentReport })));
const LessonsAdmin = lazy(() => import('./pages/admin/Content').then((m) => ({ default: m.LessonsAdmin })));
const QuizzesAdmin = lazy(() => import('./pages/admin/Content').then((m) => ({ default: m.QuizzesAdmin })));
const VideosAdmin = lazy(() => import('./pages/admin/Content').then((m) => ({ default: m.VideosAdmin })));
const CharactersAdmin = lazy(() => import('./pages/admin/Content').then((m) => ({ default: m.CharactersAdmin })));
const AuditLog = lazy(() => import('./pages/admin/Content').then((m) => ({ default: m.AuditLog })));

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/register" element={<Register />} />
              <Route path="/login" element={<Login />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/suspended" element={<Suspended />} />
            </Route>
            <Route element={<RequireLearner><AppLayout /></RequireLearner>}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/learn/hiragana" element={<KanaModulePage script="hiragana" />} />
              <Route path="/learn/katakana" element={<KanaModulePage script="katakana" />} />
              <Route path="/learn/hiragana/:char" element={<CharacterDetail script="hiragana" />} />
              <Route path="/learn/katakana/:char" element={<CharacterDetail script="katakana" />} />
              <Route path="/learn/greetings" element={<PhraseModule module="greetings" />} />
              <Route path="/learn/self-intro" element={<PhraseModule module="self_intro" />} />
              <Route path="/learn/business" element={<PhraseModule module="business" />} />
              <Route path="/writing" element={<WritingStudio />} />
              <Route path="/videos" element={<VideoLibrary />} />
              <Route path="/videos/:id" element={<VideoPlayer />} />
              <Route path="/profile" element={<Profile />} />
            </Route>
            <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
              <Route index element={<AdminOverview />} />
              <Route path="students" element={<Students />} />
              <Route path="students/:id" element={<StudentReport />} />
              <Route path="lessons" element={<LessonsAdmin />} />
              <Route path="quizzes" element={<QuizzesAdmin />} />
              <Route path="videos" element={<VideosAdmin />} />
              <Route path="characters" element={<CharactersAdmin />} />
              <Route path="audit" element={<AuditLog />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
