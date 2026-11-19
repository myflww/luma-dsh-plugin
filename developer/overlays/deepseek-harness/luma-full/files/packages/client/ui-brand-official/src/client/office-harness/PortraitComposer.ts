import { PORTRAIT_IMAGE_MEDIA_TYPES, type PortraitImageMediaType, type PortraitComposerConfiguration, type PortraitComposerImage } from '../../office-workflow/shared/work-order-prompt-contract.ts'
export { PORTRAIT_IMAGE_MEDIA_TYPES, type PortraitImageMediaType, type PortraitComposerConfiguration, type PortraitComposerImage } from '../../office-workflow/shared/work-order-prompt-contract.ts'

/** Harness-backed controls exposed directly by an employee portrait surface. */

export interface PortraitReasoningOption {
  readonly id: string
  readonly label: string
  readonly description?: string
}

export interface PortraitModelOption {
  /** Opaque UI id. Callers must not parse it; provider/model are carried beside it. */
  readonly id: string
  readonly provider: string
  readonly model: string
  readonly label: string
  readonly providerLabel: string
  readonly description?: string
  readonly reasoning: readonly PortraitReasoningOption[]
  readonly defaultReasoningEffort?: string
}

export interface PortraitPermissionOption {
  readonly id: string
  readonly label: string
  readonly description?: string
  readonly requiresConfirmation: boolean
}

export interface PortraitComposerOptions {
  readonly status: 'ready' | 'needs-session' | 'unavailable'
  readonly models: readonly PortraitModelOption[]
  readonly permissions: readonly PortraitPermissionOption[]
  readonly acceptedMediaTypes: readonly PortraitImageMediaType[]
  readonly currentModelId?: string
  readonly currentReasoningEffort?: string
  readonly currentPermissionId?: string
  readonly reason?: string
  /**
   * Set when the directory is the Host-wide catalog rather than a session's own
   * projection: every value is still real, but a permission choice only takes
   * effect once the topic exists.
   */
  readonly sessionBound?: boolean
  readonly characterAIProfileRevision?: number
}

/**
 * The permission presets every Harness permission surface ships. They are the
 * pre-session fallback for the portrait: before a topic exists there is no
 * session projection to read, and offering nothing would leave the control
 * dead. A live session's own projection always replaces this list.
 */
export const DEFAULT_PORTRAIT_PERMISSIONS: readonly PortraitPermissionOption[] = Object.freeze([
  Object.freeze({ id: 'read-only', label: '只读', description: '只能读取，不能创建或修改文件。', requiresConfirmation: false }),
  Object.freeze({ id: 'workspace-write', label: '工作区写入', description: '可以在员工自己的工作文件夹内创建和修改文件。', requiresConfirmation: false }),
  Object.freeze({ id: 'danger-full-access', label: '完全访问', description: '不再逐步确认，可以访问本机其它路径。', requiresConfirmation: true }),
])

/** One employee's working location, as resolved by the office coordinator. */
export interface PortraitWorkspaceState {
  /** Whether a Harness workspace is bound instead of the Luma employee folder. */
  readonly kind: 'workspace' | 'folder'
  /** Absolute path, when one is known. */
  readonly path?: string
  /** The bound Harness workspace id, when a folder is not in use. */
  readonly workspaceId?: string
  /** Why no path is known yet; the portrait renders this verbatim. */
  readonly reason?: string
}

/**
 * A browser-selected image after it has been encoded for Harness submission.
 * The opaque id and byte size exist only so the portrait UI can render and
 * remove individual files without interpreting the image payload.
 */
export interface PortraitComposerAttachment extends PortraitComposerImage {
  readonly id: string
  readonly size: number
}

export interface PortraitComposerSubmission {
  readonly configuration: PortraitComposerConfiguration
  readonly attachments: readonly PortraitComposerAttachment[]
}

export function portraitModelOptionId(provider: string, model: string): string {
  return `${provider}\u0000${model}`
}

export function isPortraitImageMediaType(value: unknown): value is PortraitImageMediaType {
  return typeof value === 'string'
    && (PORTRAIT_IMAGE_MEDIA_TYPES as readonly string[]).includes(value)
}
