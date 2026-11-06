import type { EnvId } from "./environments";

export const copy = {
  wrongPassword: "Wrong email or password.",
  confirmEmail: "Confirm your email first, then sign in.",
  cantReach: (env: EnvId) => env === "local"
    ? "Can't reach Resumora. Is the app running?"
    : "Can't reach Resumora. Check your connection.",
  somethingWrong: "Something went wrong. Try again.",
  signInTitle: "Sign in to Resumora",
  email: "Email",
  password: "Password",
  signIn: "Sign in",
  connectTo: "Connect to",
  notSetUp: "(not set up in this build)",
  createAccount: "Create an account",
  forgotPassword: "Forgot password",
  signOut: "Sign out",
  readyTitle: "You're signed in",
  readyText: "Open a job ad and click the Resumora icon to save it.",
  expired: "Your sign-in expired. Sign in again.",
};
