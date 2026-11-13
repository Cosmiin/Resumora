import { Navigate, type RouteObject } from "react-router";
import { AccountLayout } from "./account/AccountLayout.tsx";
import { DataPage } from "./account/DataPage.tsx";
import { ExtensionPage } from "./account/ExtensionPage.tsx";
import { PreferencesPage } from "./account/PreferencesPage.tsx";
import { ProfilePage } from "./account/ProfilePage.tsx";
import { ForgotPasswordPage } from "./auth/ForgotPasswordPage.tsx";
import { LoginPage } from "./auth/LoginPage.tsx";
import { ResetPasswordPage } from "./auth/ResetPasswordPage.tsx";
import { RequireAuth } from "./auth/RequireAuth.tsx";
import { SignUpPage } from "./auth/SignUpPage.tsx";
import { CvPage } from "./cv/CvPage.tsx";
import { ExportPage } from "./cvs/ExportPage.tsx";
import { TemplatePage } from "./cvs/TemplatePage.tsx";
import { JobsPage } from "./jobs/JobsPage.tsx";
import { JobPage } from "./jobs/JobPage.tsx";
import { HomePage } from "./public/HomePage.tsx";
import { TailorFlow } from "./tailor/TailorFlow.tsx";
import { TailoredCvPage } from "./tailor/TailoredCvPage.tsx";

export const routes: RouteObject[] = [
  // The homepage sends a signed-in visitor on to their CV.
  { path: "/", element: <HomePage /> },
  { path: "/signup", element: <SignUpPage /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: "/cv", element: <CvPage /> },
      { path: "/cv/template", element: <TemplatePage /> },
      { path: "/cv/export", element: <ExportPage /> },
      // My CVs is gone: a tailored CV lives on its job's page. Old links land on Jobs.
      { path: "/cvs", element: <Navigate to="/jobs" replace /> },
      { path: "/jobs", element: <JobsPage /> },
      { path: "/jobs/:id", element: <JobPage /> },
      { path: "/jobs/:id/tailor", element: <TailorFlow /> },
      { path: "/jobs/:id/cv", element: <TailoredCvPage /> },
      { path: "/jobs/:id/cv/template", element: <TemplatePage /> },
      { path: "/jobs/:id/cv/export", element: <ExportPage /> },
      {
        path: "/account",
        element: <AccountLayout />,
        children: [
          { index: true, element: <Navigate to="/account/profile" replace /> },
          { path: "profile", element: <ProfilePage /> },
          { path: "preferences", element: <PreferencesPage /> },
          { path: "data", element: <DataPage /> },
          { path: "extension", element: <ExtensionPage /> },
        ],
      },
    ],
  },
  // Development only: every kit component and state. Not part of the built app.
  ...(import.meta.env.DEV ? [{ path: "/dev/ui", lazy: async () => ({ Component: (await import("./dev/UiGallery.tsx")).UiGallery }) }] : []),
  { path: "*", element: <Navigate to="/" replace /> },
];
