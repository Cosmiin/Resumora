import type { ReactNode } from "react";
import type { CvContent } from "@resumora/shared";
import type { CvAction } from "../cvReducer.ts";
import type { RoleScoreState } from "../../enrich/useRoleScores.ts";

export type SectionProps = { cv: CvContent; dispatch(a: CvAction): void; scores?: ReadonlyMap<string, RoleScoreState> };
export type SectionRenderer = (p: SectionProps) => ReactNode;
