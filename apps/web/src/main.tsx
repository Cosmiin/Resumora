import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createBrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource-variable/newsreader";
import "@fontsource-variable/instrument-sans";
import { AuthProvider } from "./auth/AuthProvider.tsx";
import { routes } from "./router.tsx";
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/auth.css";
import "./styles/editor.css";
import "./styles/review.css";
import "./styles/cv-page.css";
import "./styles/panel.css";
import "./styles/enrich.css";
import "./styles/focus.css";

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
