import type { ReactNode } from "react";
import { PublicHeader } from "../public/PublicHeader.tsx";
import { Page, Sheet } from "../ui/index.ts";

/** A public page with one form: a short promise beside it, the form on a sheet of paper. Stacks under 900px. */
export function AuthLayout({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <Page>
      <PublicHeader />
      <main className="ui-wrap auth">
        <div>
          <h1 className="auth-side-title">{title}</h1>
          <p className="ui-lead auth-side-text">{text}</p>
        </div>
        <Sheet>{children}</Sheet>
      </main>
    </Page>
  );
}
