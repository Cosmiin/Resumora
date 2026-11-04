export type AuthAccount = { id: string; email: string };
export type AuthStatus = {
  user: AuthAccount | null;
  csrfToken: string;
  recovery: boolean;
};
type AuthAction = "session" | "login" | "signup" | "recovery" | "password";
const unavailable =
  "Autentificarea nu este disponibilă momentan. Reîncearcă conexiunea.";
const invalid =
  "Răspunsul serviciului de autentificare nu a putut fi verificat. Reîncearcă conexiunea.";
const messages: Readonly<Record<string, string>> = {
  AUTH_UNAVAILABLE: unavailable,
  AUTH_UNCONFIGURED: unavailable,
  INVALID_CREDENTIALS: "Emailul sau parola sunt incorecte.",
  EMAIL_NOT_CONFIRMED:
    "Confirmă adresa de email folosind linkul primit, apoi autentifică-te.",
  RATE_LIMITED: "Prea multe încercări. Așteaptă puțin înainte să reîncerci.",
  INVALID_INPUT: "Verifică emailul și parola introduse, apoi reîncearcă.",
  FORBIDDEN: "Sesiunea trebuie verificată din nou. Reîncearcă conexiunea.",
  UNAUTHORIZED:
    "Sesiunea a expirat. Autentifică-te din nou sau cere un link nou de resetare.",
  FLOW_PENDING:
    "Ai deja un link trimis. Verifică emailul și deschide linkul în acest browser.",
  RECOVERY_IN_PROGRESS:
    "Schimbarea parolei este în curs. Așteaptă puțin înainte să reîncerci.",
  PASSWORD_TOO_WEAK:
    "Parola este prea slabă. Alege o parolă mai lungă, cu litere, cifre și simboluri.",
  PASSWORD_UPDATE_FAILED:
    "Parola nu a putut fi schimbată. Cere un link nou și încearcă din nou.",
  LOGOUT_INCOMPLETE: "Deconectarea nu este confirmată. Reîncearcă.",
};
export class AuthResponseError extends Error {}
export function authErrorMessage(error: unknown): string {
  return error instanceof AuthResponseError
    ? error.message
    : "Nu am putut contacta serviciul de autentificare. Verifică conexiunea și reîncearcă.";
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function account(value: unknown): value is AuthAccount {
  return record(value) && nonempty(value.id) && nonempty(value.email);
}
function session(value: unknown): value is AuthStatus {
  return (
    record(value) &&
    nonempty(value.csrfToken) &&
    typeof value.recovery === "boolean" &&
    (value.user === null ? !value.recovery : account(value.user))
  );
}
export function readAuthResponse(
  response: Response,
  action: "session",
): Promise<AuthStatus>;
export function readAuthResponse(
  response: Response,
  action: Exclude<AuthAction, "session">,
): Promise<void>;
export async function readAuthResponse(
  response: Response,
  action: AuthAction,
): Promise<AuthStatus | void> {
  // Proxies can return empty or HTML errors. Neither their body nor provider diagnostics belong in the UI.
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  if (!response.ok) {
    const code =
      record(body) && record(body.error) && typeof body.error.code === "string"
        ? body.error.code
        : "";
    throw new AuthResponseError(
      response.status >= 500
        ? unavailable
        : response.status === 429
          ? messages.RATE_LIMITED
          : Object.hasOwn(messages, code)
            ? messages[code]
            : "Cererea nu a reușit. Reîncearcă conexiunea și încearcă din nou.",
    );
  }
  if (action === "session") {
    if (!session(body)) throw new AuthResponseError(invalid);
    return body;
  }
  if (
    !record(body) ||
    body.error ||
    (action === "login" ? !account(body.user) : !nonempty(body.message))
  )
    throw new AuthResponseError(invalid);
}
