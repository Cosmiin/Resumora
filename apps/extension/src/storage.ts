import type { EnvId } from "./environments";

export interface KeyValueStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export function chromeStorage(
  chromeApi: Pick<typeof chrome, "storage"> = chrome,
): KeyValueStorage {
  const local = chromeApi.storage.local as typeof chromeApi.storage.local & {
    set(items: Record<string, string>): Promise<void>;
    remove(key: string): Promise<void>;
  };
  return {
    async get(key) {
      const value = (await local.get(key))[key];
      return typeof value === "string" ? value : null;
    },
    set: (key, value) => local.set({ [key]: value }),
    remove: (key) => local.remove(key),
  };
}

export function memoryStorage(): KeyValueStorage {
  const values = new Map<string, string>();
  return {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => { values.set(key, value); },
    remove: async (key) => { values.delete(key); },
  };
}

export async function getEnvId(storage: KeyValueStorage): Promise<EnvId> {
  return await storage.get("env") === "hosted" ? "hosted" : "local";
}

export async function setEnvId(storage: KeyValueStorage, id: EnvId): Promise<void> {
  await storage.set("env", id);
}
