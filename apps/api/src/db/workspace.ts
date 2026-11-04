import type {
  DraftKind,
  WorkspaceDraft,
  CareerOperation,
} from "@resumora/contracts/editor/workspace";
import type { DraftSnapshot } from "@resumora/contracts/editor/transport";
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
  };
}
