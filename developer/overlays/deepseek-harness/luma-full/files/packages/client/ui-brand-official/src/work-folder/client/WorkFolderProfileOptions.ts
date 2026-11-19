import type { CharacterAIProfileClient } from "../../character-ai/client/CharacterAIProfileClient.ts";
import { isCompanionId } from "../../companion/companion-protocol.ts";
import {
  portraitModelOptionId,
  type PortraitComposerOptions,
} from "../../client/office-harness/PortraitComposer.ts";

export interface WorkFolderProfileOptions extends PortraitComposerOptions {
  /** Binds acknowledgement to this saved role selection, including reasoning. */
  readonly profileStamp?: string;
}

const unavailable = (reason: string): WorkFolderProfileOptions => ({
  status: "unavailable",
  models: [],
  permissions: [],
  acceptedMediaTypes: [],
  reason,
});

/** The shared Settings/chat profile owner is the only work-folder model source. */
export function readWorkFolderProfileOptions(
  profiles: CharacterAIProfileClient | undefined,
  employeeId: string,
): WorkFolderProfileOptions {
  if (!profiles || !isCompanionId(employeeId))
    return unavailable("角色模型设置暂不可读取，请到设置检查绑定。草稿会保留。");
  const snapshot = profiles.getSnapshot(employeeId);
  if (snapshot.pending || snapshot.refreshing || snapshot.readError || !snapshot.state)
    return unavailable("角色的当前模型暂不可核实，请重新读取后确认。草稿会保留。");
  const { profile, models } = snapshot.state;
  const selection = profile.selection;
  if (!selection)
    return unavailable("此角色尚未绑定模型，请先在「设置 → 角色与 AI」中绑定。草稿会保留。");
  const model = models.find(
    (row) => row.provider === selection.provider && row.model === selection.model,
  );
  if (!model || selection.reasoningEffort !== undefined &&
      !model.reasoning?.efforts.some((effort) => effort.id === selection.reasoningEffort))
    return unavailable("此角色绑定的模型或思考强度已不可用，请到设置核对。草稿会保留。");
  const id = portraitModelOptionId(selection.provider, selection.model);
  return {
    status: "ready",
    models: [{
      id,
      provider: selection.provider,
      model: selection.model,
      providerLabel: selection.provider,
      label: model.label,
      reasoning: (model.reasoning?.efforts ?? []).map((effort) => ({
        id: effort.id,
        label: effort.name,
      })),
    }],
    permissions: [],
    acceptedMediaTypes: [],
    currentModelId: id,
    ...(selection.reasoningEffort === undefined ? {} : {
      currentReasoningEffort: selection.reasoningEffort,
    }),
    profileStamp: JSON.stringify([
      profile.employeeId, profile.revision,
      selection.provider, selection.model, selection.reasoningEffort ?? null,
    ]),
  };
}

const noSubscription = () => () => {};
const noVersion = () => 0;
export const workFolderProfileSubscription = (profiles: CharacterAIProfileClient | undefined) => ({
  subscribe: profiles?.subscribe ?? noSubscription,
  getVersion: profiles?.getVersion ?? noVersion,
});
