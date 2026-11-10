import { Navigate, type RouteObject } from "react-router";
import { LoginPage } from "./auth/LoginPage.tsx";
import { ResetPasswordPage } from "./auth/ResetPasswordPage.tsx";
import { RequireAuth } from "./auth/RequireAuth.tsx";
import { CvPage } from "./cv/CvPage.tsx";
import { JobsPage } from "./jobs/JobsPage.tsx";
import { JobPage } from "./jobs/JobPage.tsx";
import { TailorFlow } from "./tailor/TailorFlow.tsx";
import { TailoredCvPage } from "./tailor/TailoredCvPage.tsx";

export const routes: RouteObject[] = [
  { path: "/login", element: <LoginPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: "/", element: <Navigate to="/cv" replace /> },
      { path: "/cv", element: <CvPage /> },
      { path: "/jobs", element: <JobsPage /> },
      { path: "/jobs/:id", element: <JobPage /> },
      { path: "/jobs/:id/tailor", element: <TailorFlow /> },
      { path: "/jobs/:id/cv", element: <TailoredCvPage /> },
    ],
  },
  // Development only: every kit component and state. Not part of the built app.
  ...(import.meta.env.DEV ? [{ path: "/dev/ui", lazy: async () => ({ Component: (await import("./dev/UiGallery.tsx")).UiGallery }) }] : []),
  { path: "*", element: <Navigate to="/" replace /> },
];
