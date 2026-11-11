import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createBrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource-variable/newsreader";
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/atkinson-hyperlegible-next";
import "@fontsource-variable/shantell-sans";
import { AuthProvider } from "./auth/AuthProvider.tsx";
import { routes } from "./router.tsx";
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/editor.css";
import "./styles/review.css";
import "./styles/cv-page.css";
import "./styles/panel.css";
import "./styles/enrich.css";
import "./styles/jobs.css";
import "./styles/focus.css";
import "./styles/ui.css";
import "./styles/shell.css";
import "./styles/public.css";
import "./styles/account.css";
import { getLanguage } from "./i18n/language.ts";

document.documentElement.lang = getLanguage();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});
const router = createBrowserRouter(routes);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
