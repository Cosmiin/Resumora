/** All UI copy. Romanian gets its own file with the same keys later. */
export const en = {
  "app.name": "Resumora",
  "app.loading": "Loading…",
  "app.signOut": "Sign out",

  "auth.signIn.title": "Sign in",
  "auth.signIn.submit": "Sign in",
  "auth.signUp.title": "Create your account",
  "auth.signUp.submit": "Create account",
  "auth.signUp.done": "Account created. Check your email if confirmation is required, then sign in.",
  "auth.forgot.title": "Reset your password",
  "auth.forgot.submit": "Send reset link",
  "auth.forgot.done": "If an account exists for that email, a reset link is on its way.",
  "auth.reset.title": "Choose a new password",
  "auth.reset.submit": "Save new password",
  "auth.reset.done": "Password updated.",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.newPassword": "New password",
  "auth.toSignUp": "No account yet? Create one",
  "auth.toSignIn": "Already have an account? Sign in",
  "auth.toForgot": "Forgot your password?",
  "auth.wrongCredentials": "Wrong email or password.",
  "auth.emailNotConfirmed": "Please confirm your email first, then sign in.",
  "auth.weakPassword": "Use a password with at least 8 characters.",
  "auth.rateLimited": "Too many attempts. Please wait a minute and try again.",
  "auth.genericError": "Something went wrong. Please try again.",

  "api.network": "Can't reach Resumora. Check your connection.",
} as const;

export type MessageKey = keyof typeof en;
