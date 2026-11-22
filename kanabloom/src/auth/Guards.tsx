import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { PageLoader } from '../components/ui';

// Route guards are a UX convenience only. Real protection is Row Level Security and
// server-side role checks in the database — a learner who bypasses these gets no data.

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <PageLoader />;
  if (!session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (!profile) return <PageLoader label="Loading your profile…" />;
  if (profile.status !== 'active') return <Navigate to="/suspended" replace />;
  return <>{children}</>;
}

export function RequireLearner({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  if (profile?.role === 'admin') return <Navigate to="/admin" replace />;
  return <RequireAuth>{children}</RequireAuth>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { session, profile, loading, isAdmin } = useAuth();
  if (loading) return <PageLoader />;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile) return <PageLoader label="Checking access…" />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
