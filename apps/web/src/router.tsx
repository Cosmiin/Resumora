import { Navigate, type RouteObject } from "react-router";
import { LoginPage } from "./auth/LoginPage.tsx";
import { ResetPasswordPage } from "./auth/ResetPasswordPage.tsx";
import { RequireAuth } from "./auth/RequireAuth.tsx";
import { CvPage } from "./cv/CvPage.tsx";
import { JobsPage } from "./jobs/JobsPage.tsx";

export const routes: RouteObject[] = [
  { path: "/login", element: <LoginPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: "/", element: <Navigate to="/cv" replace /> },
      { path: "/cv", element: <CvPage /> },
      { path: "/jobs", element: <JobsPage /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
];
