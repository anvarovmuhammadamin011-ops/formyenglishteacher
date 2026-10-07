import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { AppShell, Splash } from "@/components/layout";
import { ErrorBoundary } from "@/components/ErrorBoundary";

import LoginPage from "@/pages/Login";
import NotFound from "@/pages/NotFound";
import TeacherDashboard from "@/pages/teacher/Dashboard";
import StudentsPage from "@/pages/teacher/Students";
import StudentDetailPage from "@/pages/teacher/StudentDetail";
import TestsPage from "@/pages/teacher/Tests";
import TestEditorPage from "@/pages/teacher/TestEditor";
import TestResultsPage from "@/pages/teacher/TestResults";
import AssignmentsPage from "@/pages/teacher/Assignments";
import AiCenterPage from "@/pages/teacher/AiCenter";
import VocabularyPage from "@/pages/shared/Vocabulary";
import MaterialsPage from "@/pages/shared/Materials";
import MaterialDetailPage from "@/pages/shared/MaterialDetail";
import SettingsPage from "@/pages/shared/Settings";
import StudentDashboard from "@/pages/student/Dashboard";
import StudentTestsPage from "@/pages/student/Tests";
import TestTakePage from "@/pages/student/TestTake";
import ResultPage from "@/pages/student/Result";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof ApiError) && count < 2,
    },
    mutations: { retry: false },
  },
});

function TeacherTree() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<TeacherDashboard />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/students" element={<StudentsPage />} />
        <Route path="/students/:id" element={<StudentDetailPage />} />
        <Route path="/tests" element={<TestsPage />} />
        <Route path="/tests/new" element={<TestEditorPage />} />
        <Route path="/tests/:id" element={<TestEditorPage />} />
        <Route path="/tests/:id/results" element={<TestResultsPage />} />
        <Route path="/assignments" element={<AssignmentsPage />} />
        <Route path="/ai" element={<AiCenterPage />} />
        <Route path="/vocabulary" element={<VocabularyPage />} />
        <Route path="/reading" element={<MaterialsPage kind="reading" />} />
        <Route path="/reading/:id" element={<MaterialDetailPage kind="reading" />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppShell>
  );
}

function StudentTree() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<StudentDashboard />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/tests" element={<StudentTestsPage />} />
        <Route path="/attempts/:id" element={<TestTakePage />} />
        <Route path="/results/:id" element={<ResultPage />} />
        <Route path="/vocabulary" element={<VocabularyPage />} />
        <Route path="/reading" element={<MaterialsPage kind="reading" />} />
        <Route path="/reading/:id" element={<MaterialDetailPage kind="reading" />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppShell>
  );
}

function Root() {
  const { user, loading } = useAuth();

  if (loading) return <Splash />;

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return user.role === "TEACHER" ? <TeacherTree /> : <StudentTree />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <ErrorBoundary>
            <Root />
          </ErrorBoundary>
        </BrowserRouter>
        <Toaster position="top-right" richColors closeButton />
      </AuthProvider>
    </QueryClientProvider>
  );
}
