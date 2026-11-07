import { environmentsFrom } from "./environments";

export const environments = environmentsFrom(import.meta.env);
