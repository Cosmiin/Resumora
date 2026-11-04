import type {
  DraftKind,
  WorkspaceDraft,
  JobAnswers,
  JobAnswer,
  CareerOperation,
} from "@resumora/contracts/editor/workspace";
import type { DraftSnapshot } from "@resumora/contracts/editor/transport";
import type { SavedJob } from "@resumora/contracts/jobs/connected";
type Rpc = <T>(name: string, args: Record<string, unknown>) => Promise<T>;
export function workspaceGateway(rpc: Rpc) {
  return {
    getWorkspaceDraftContext: (kind: DraftKind, id: string) =>
      rpc<{ draft: WorkspaceDraft | null; generation: number }>(
        "get_workspace_draft_context",
        { p_kind: kind, p_id: id },
      ),
    getWorkspaceDraft: (kind: DraftKind, id: string) =>
      rpc<WorkspaceDraft | null>("get_workspace_draft", {
        p_kind: kind,
        p_id: id,
      }),
    listWorkspaceDrafts: () =>
      rpc<WorkspaceDraft[]>("list_workspace_drafts", {}),
    saveWorkspaceDraft: (i: {
      requestId: string;
      kind: DraftKind;
      id: string;
      expectedRevision: number;
      profileGeneration?: number;
      value: Record<string, unknown>;
    }) =>
      rpc<WorkspaceDraft>("save_workspace_draft", {
        p_key: i.requestId,
        p_kind: i.kind,
        p_id: i.id,
        p_revision: i.expectedRevision,
        p_value: i.value,
        p_generation: i.profileGeneration ?? null,
      }),
    submitWorkspaceIntake: (i: {
      interfaceLocale?: "ro"|"en";
      requestId: string;
      id: string;
      expectedRevision: number;
    }) =>
      rpc<SavedJob>(i.interfaceLocale === undefined ? "submit_workspace_intake" : "submit_workspace_intake_with_locale", {
        ...(i.interfaceLocale === undefined ? {} : {p_interface_locale:i.interfaceLocale}),
        p_key: i.requestId,
        p_id: i.id,
        p_revision: i.expectedRevision,
      }),
    getJobAnswers: (jobId: string) =>
      rpc<JobAnswers>("get_job_answers", { p_job: jobId }),
    saveJobAnswer: (i: {
      requestId: string;
      jobId: string;
      expectedRevision: number;
      answer: Omit<JobAnswer, "revision">;
    }) =>
      rpc<JobAnswers>("save_job_answer", {
        p_key: i.requestId,
        p_job: i.jobId,
        p_revision: i.expectedRevision,
        p_answer: i.answer,
      }),
    rejectWorkspaceOperation: (id: string) =>
      rpc<CareerOperation>("reject_workspace_operation", { p_id: id }),
    getWorkspaceOperation: (id: string) =>
      rpc<CareerOperation | null>("get_workspace_operation", { p_id: id }),
    beginWorkspaceOperation: (
      id: string,
      kind: CareerOperation["kind"],
      input: Record<string, unknown>,
    ) =>
      rpc<{ created: boolean; operation: CareerOperation }>(
        "begin_workspace_operation",
        { p_id: id, p_kind: kind, p_input: input },
      ),
    finishWorkspaceOperation: (
      id: string,
      state: "ready" | "failed" | "unknown",
      result: unknown,
      secret: string,
    ) =>
      rpc<CareerOperation>("finish_workspace_operation", {
        p_id: id,
        p_state: state,
        p_result: result,
        p_secret: secret,
      }),
    acceptProfileIntegration: (requestId: string, id: string) =>
      rpc<DraftSnapshot>("accept_profile_integration", {
        p_key: requestId,
        p_operation: id,
      }),
  };
}
