import { Navigate, type RouteObject } from "react-router";
import { LoginPage } from "./auth/LoginPage.tsx";
import { ResetPasswordPage } from "./auth/ResetPasswordPage.tsx";
import { RequireAuth } from "./auth/RequireAuth.tsx";
import { CvPage } from "./cv/CvPage.tsx";

export const routes: RouteObject[] = [
  { path: "/login", element: <LoginPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: "/", element: <Navigate to="/cv" replace /> },
      { path: "/cv", element: <CvPage /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
];
