import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AuthShell, type AuthTransport } from "./AuthShell";
import { ConnectedApp } from "./ConnectedApp";
import { httpIntelligence } from "../base/intelligence";
import { blankDraft } from "../base/model";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
afterEach(() => {
  window.location.hash = "";
});

for (const check of ["focus", "interval"] as const) {
  for (const token of ["same", "changed"] as const) {
    for (const lateStatus of [200, 401]) {
      it(`${check} fences cross-tab account replacement with ${token} CSRF before a late ${lateStatus} upload response`, async () => {
        let tick: () => void = () => {
          throw new Error("INTERVAL_NOT_REGISTERED");
        };
        if (check === "interval") {
          const schedule = window.setInterval.bind(window);
          vi.spyOn(window, "setInterval").mockImplementation(
            (handler, delay, ...args) => {
              if (delay === 60_000 && typeof handler === "function")
                tick = () => handler(...args);
              return schedule(handler, delay, ...args) as unknown as ReturnType<
                typeof window.setInterval
              >;
            },
          );
        }
        const a = {
          user: { id: "account-a", email: "a@example.invalid" },
          csrfToken: "csrf-a",
          recovery: false,
        };
        const b = {
          user: { id: "account-b", email: "b@example.invalid" },
          csrfToken: token === "same" ? "csrf-a" : "csrf-b",
          recovery: false,
        };
        let browser = a,
          probeStarted = false,
          uploadStarted = false;
        const probe = deferred<void>(),
          upload = deferred<Response>();
        const privateCalls: string[] = [],
          delivered: unknown[] = [];
        const fetcher = vi.fn(
          async (input: RequestInfo | URL, init?: RequestInit) => {
            const path = String(input);
            if (path === "/v1/auth/session") {
              const observed = browser;
              if (observed === b) {
                probeStarted = true;
                await probe.promise;
              }
              return Response.json(observed);
            }
            expect(init?.credentials).toBe("same-origin");
            expect(init?.cache).toBe("no-store");
            if (
              path === "/v1/intelligence/imports" &&
              init?.method === "POST"
            ) {
              uploadStarted = true;
              return upload.promise;
            }
            privateCalls.push(path);
            if (path === "/v1/base-cv") {
              const draft = blankDraft(),
                first = browser === a ? "Alpha" : "Beta";
              draft.name.value = first + " Example";
              draft.nameParts = { first, last: "Example" };
              return Response.json({
                id: crypto.randomUUID(),
                revision: 1,
                parentId: null,
                createdAt: new Date().toISOString(),
                reason: "autosave",
                draft,
              });
            }
            return Response.json({ privateOwner: browser.user.id });
          },
        );
        let accountTransport!: AuthTransport;
        window.location.hash = "#base";
        render(
          <AuthShell fetcher={fetcher}>
            {(account, transport) => {
              accountTransport = transport;
              return <ConnectedApp account={account} transport={transport} />;
            }}
          </AuthShell>,
        );
        await screen.findByDisplayValue("Alpha");
        const retired = accountTransport;
        const uploadOutcome = Promise.allSettled([
          httpIntelligence(retired).importDocument(
            new File(["%PDF-synthetic"], "cv.pdf"),
            crypto.randomUUID(),
            1,
          ),
        ]);
        await waitFor(() => expect(uploadStarted).toBe(true));
        browser = b;
        if (check === "focus") fireEvent.focus(window);
        else await act(async () => tick());
        const paths = [
          "/v1/base-cv/history",
          "/v1/intelligence/imports",
          "/v1/intelligence/imports/synthetic",
          "/v1/base-cv/save",
        ];
        const outcomes = Promise.allSettled(
          paths.map(async (path) => {
            const response = await retired(
              path,
              path.endsWith("/save") ? { method: "POST", body: "{}" } : {},
            );
            delivered.push(await response.json());
          }),
        );
        try {
          await waitFor(() => expect(probeStarted).toBe(true));
          expect(screen.getByDisplayValue("Alpha")).toBeTruthy();
          expect(screen.queryByDisplayValue("Beta")).toBeNull();
          expect(privateCalls).toEqual(["/v1/base-cv"]);
          expect(delivered).toEqual([]);
          await act(async () => probe.resolve());
          await screen.findByDisplayValue("Beta");
          expect(screen.queryByDisplayValue("Alpha")).toBeNull();
          for (const outcome of await outcomes)
            expect(outcome).toMatchObject({
              status: "rejected",
              reason: { message: "SESSION_CHANGED" },
            });
          expect(delivered).toEqual([]);
          expect(privateCalls).toEqual(["/v1/base-cv", "/v1/base-cv"]);
          await expect(
            retired("/v1/intelligence/imports/synthetic/cancel", {
              method: "POST",
              body: "{}",
            }),
          ).rejects.toThrow("SESSION_CHANGED");
        } finally {
          await act(async () => {
            probe.resolve();
            upload.resolve(
              Response.json(
                { privateOwner: "account-a" },
                { status: lateStatus },
              ),
            );
          });
        }
        expect((await uploadOutcome)[0]).toMatchObject({
          status: "rejected",
          reason: { message: "SESSION_CHANGED" },
        });
        expect(screen.getByDisplayValue("Beta")).toBeTruthy();
        expect(screen.queryByRole("alert")).toBeNull();
      });
    }
  }
}

it("logout drains processing and an in-flight verification before clearing cookies", async () => {
  const upload = deferred<Response>(),
    probe = deferred<void>();
  const signed = {
    user: { id: "a", email: "a@example.invalid" },
    csrfToken: "csrf-a",
    recovery: false,
  };
  const anonymous = {
    user: null,
    csrfToken: "csrf-anonymous",
    recovery: false,
  };
  let checks = 0,
    cookie = "a",
    started = false,
    transport!: AuthTransport;
  const events: string[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path === "/v1/auth/session") {
      if (++checks === 2) {
        events.push("probe started");
        await probe.promise;
      }
      return Response.json(cookie === "a" ? signed : anonymous);
    }
    if (path === "/v1/intelligence/imports") {
      started = true;
      return upload.promise;
    }
    if (path === "/v1/auth/logout") {
      events.push("logout");
      cookie = "anonymous";
      return Response.json({});
    }
    throw new Error("UNEXPECTED_REQUEST");
  });
  render(
    <AuthShell fetcher={fetcher}>
      {(_, current) => {
        transport = current;
        return <p>Private A</p>;
      }}
    </AuthShell>,
  );
  await screen.findByText("Private A");
  const retired = transport;
  const processing = Promise.allSettled([retired("/v1/intelligence/imports")]);
  await waitFor(() => expect(started).toBe(true));
  fireEvent.focus(window);
  await waitFor(() => expect(events).toContain("probe started"));
  fireEvent.click(screen.getByRole("button", { name: "Deconectare" }));
  expect(screen.queryByText("Private A")).toBeNull();
  const control = Promise.allSettled([
    retired("/v1/intelligence/imports/synthetic/cancel", {
      method: "POST",
      body: "{}",
    }),
  ]);
  await act(async () => probe.resolve());
  expect(events).not.toContain("logout");
  await act(async () => {
    events.push("old cookies applied");
    upload.resolve(Response.json({}));
  });
  await waitFor(() => expect(events).toContain("logout"));
  expect((await processing)[0].status).toBe("rejected");
  expect((await control)[0].status).toBe("rejected");
  expect(events.indexOf("old cookies applied")).toBeLessThan(
    events.indexOf("logout"),
  );
  expect(cookie).toBe("anonymous");
  expect(screen.queryByText("Private A")).toBeNull();
});
