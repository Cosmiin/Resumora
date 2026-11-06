import type { Auth } from "./auth";
import { copy } from "./copy";
import type { EnvConfig, EnvId } from "./environments";
import type { PopupState, Request, SignInReply } from "./messages";
import { getEnvId, setEnvId, type KeyValueStorage } from "./storage";

export function createHandler(deps: {
  storage: KeyValueStorage;
  auth: Auth;
  environments: Record<EnvId, EnvConfig>;
}): (req: Request) => Promise<unknown> {
  const state = async (env: EnvId): Promise<PopupState> => ({
    env,
    email: await deps.auth.email(env),
    environments: Object.values(deps.environments).map(({ id, label, configured }) => ({
      id, label, configured,
    })),
  });

  return async (req) => {
    const env = await getEnvId(deps.storage);
    switch (req.type) {
      case "getState":
        return state(env);
      case "signIn": {
        const result = await deps.auth.signIn(env, req.email, req.password);
        const reply: SignInReply = result.ok
          ? { ok: true, state: await state(env) }
          : result;
        return reply;
      }
      case "signOut":
        await deps.auth.signOut(env);
        return state(env);
      case "setEnvironment":
        if (!deps.environments[req.env].configured) return state(env);
        await setEnvId(deps.storage, req.env);
        return state(req.env);
      case "saveActiveTab":
        return { kind: "error", message: copy.somethingWrong };
    }
  };
}
