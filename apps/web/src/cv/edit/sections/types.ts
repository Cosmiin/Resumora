import type { ReactNode } from "react";
import type { CvContent } from "@resumora/shared";
import type { CvAction } from "../cvReducer.ts";

export type SectionProps = { cv: CvContent; dispatch(a: CvAction): void };
export type SectionRenderer = (p: SectionProps) => ReactNode;
