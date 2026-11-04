import { equalValues, clone } from "../base/model";
export type ResourceState<T, H = unknown> = {
  value: T;
  revision: number;
  head: H | null;
  ready: boolean;
  busy: boolean;
  error: string | null;
  dirty: boolean;
};
export type ResourceIO<T, H> = {
  load: () => Promise<{ value: T; revision: number; head: H | null } | null>;
  save: (
    value: T,
    expectedRevision: number,
    requestId: string,
  ) => Promise<{ value: T; revision: number; head: H | null }>;
};
/** One account/resource, one immutable in-flight body. Views do not own saving. */
export class SaveController<T, H = unknown> {
  state: ResourceState<T, H>;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: { value: T; revision: number; requestId: string } | null =
    null;
  private inFlight: Promise<boolean> | null = null;
  private loading: Promise<void> | null = null;
  private disposed = false;
  constructor(
    readonly key: string,
    initial: T,
    private io: ResourceIO<T, H>,
    private changed: () => void = () => {},
    private autosave = true,
  ) {
    this.state = {
      value: clone(initial),
      revision: 0,
      head: null,
      ready: false,
      busy: false,
      error: null,
      dirty: false,
    };
  }
  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => {
      this.listeners.delete(f);
    };
  };
  snapshot = () => this.state;
  private emit(patch: Partial<ResourceState<T, H>>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    for (const f of this.listeners) f();
    this.changed();
  }
  load() {
    if (this.loading) return this.loading;
    if (this.state.ready) return Promise.resolve();
    this.loading = this.io
      .load()
      .then((saved) => {
        if (this.disposed) return;
        if (saved) this.emit({ ...saved, ready: true });
        else this.emit({ ready: true });
      })
      .catch((e) => {
        this.emit({
          ready: false,
          error: e instanceof Error ? e.message : "load",
        });
      })
      .finally(() => {
        this.loading = null;
      });
    return this.loading;
  }
  set = (next: T | ((current: T) => T)) => {
    if (!this.state.ready) return;
    const value =
      typeof next === "function"
        ? (next as (v: T) => T)(this.state.value)
        : next;
    if (equalValues(value, this.state.value)) return;
    this.emit({ value: clone(value), dirty: true });
    this.schedule();
  };
  private schedule() {
    clearTimeout(this.timer);
    if (this.autosave && this.state.ready && !this.state.error)
      this.timer = setTimeout(() => {
        void this.flush();
      }, 650);
  }
  async flush(): Promise<boolean> {
    clearTimeout(this.timer);
    await this.load();
    if (
      this.disposed ||
      !this.state.ready ||
      (this.state.error && !this.pending)
    )
      return false;
    if (this.inFlight) {
      await this.inFlight;
      if (this.state.dirty && !this.state.error) return this.flush();
      return !this.state.error && !this.state.dirty;
    }
    if (!this.state.dirty && !this.pending) return !this.state.error;
    const body = this.pending ?? {
      value: clone(this.state.value),
      revision: this.state.revision,
      requestId: crypto.randomUUID(),
    };
    this.pending = body;
    this.emit({ busy: true, error: null });
    this.inFlight = (async () => {
      try {
        const saved = await this.io.save(
          clone(body.value),
          body.revision,
          body.requestId,
        );
        if (this.disposed) return false;
        this.pending = null;
        const dirty = !equalValues(this.state.value, body.value);
        this.emit({
          revision: saved.revision,
          head: saved.head,
          busy: false,
          error: null,
          dirty,
        });
        return !dirty;
      } catch (e) {
        this.emit({
          busy: false,
          error: e instanceof Error ? e.message : "save",
        });
        return false;
      } finally {
        this.inFlight = null;
        if (this.state.dirty && !this.state.error) this.schedule();
      }
    })();
    const success = await this.inFlight;
    return success;
  }
  persist = async () => {
    await this.load();
    if (!this.state.head && this.state.ready) this.emit({ dirty: true });
    return this.flush();
  };
  retry = async () => {
    this.emit({ error: null });
    return this.flush();
  };
  async resolve(keepLocal: boolean) {
    try {
      const saved = await this.io.load();
      if (this.disposed) return;
      this.pending = null;
      this.emit({
        revision: saved?.revision ?? 0,
        head: saved?.head ?? null,
        value: keepLocal
          ? this.state.value
          : (saved?.value ?? this.state.value),
        error: null,
        dirty: keepLocal,
      });
      if (keepLocal) await this.flush();
    } catch (e) {
      this.emit({ error: e instanceof Error ? e.message : "load" });
    }
  }
  acknowledge(value: T, revision: number, head: H | null) {
    if (this.state.dirty || this.pending) throw Error("unresolvedSave");
    this.emit({
      value: clone(value),
      revision,
      head,
      ready: true,
      error: null,
      dirty: false,
    });
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.listeners.clear();
  }
}
