import type { ISessions, IWorkspaces, SessionId, SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import { HarnessOfficeProjectionAdapter, createHarnessOfficeProjectionSource, type HarnessConversationLauncher, type HarnessConversationLaunchRequest, type OfficeRelationshipSource } from './HarnessOfficeProjectionAdapter.ts'
import { OFFICE_EMPLOYEE_DEFINITIONS } from './OfficeRelationships.ts'

export interface OfficeHarnessRuntime {
  sessions: Pick<ISessions, 'list' | 'binding' | 'open'>
  workspaces: Pick<IWorkspaces, 'list' | 'startSession'>
}


function mostRelevantSession(list: SessionListState): SessionId | undefined {
  return list.current ?? list.ids[0]
}

function fallbackRelationshipSource(sessions: OfficeHarnessRuntime['sessions']): OfficeRelationshipSource {
  return {
    getSnapshot() {
      const sessionId = mostRelevantSession(sessions.list.getSnapshot())
      return {
        employees: Object.values(OFFICE_EMPLOYEE_DEFINITIONS).map((definition, index) => ({
          employeeId: definition.id,
          displayName: definition.displayName,
          agentPresetId: definition.agentPresetId,
          ...(index === 0 && sessionId !== undefined ? { sessionId } : {}),
        })),
      }
    },
  }
}

/** Create the Harness -> office projection; Harness remains task authority. */
export function createHarnessOfficeExperienceAdapter(
  runtime: OfficeHarnessRuntime,
  relationships: OfficeRelationshipSource = fallbackRelationshipSource(runtime.sessions),
  conversationLauncher?: HarnessConversationLauncher,
): HarnessOfficeProjectionAdapter {
  return new HarnessOfficeProjectionAdapter(
    createHarnessOfficeProjectionSource(runtime.sessions, runtime.workspaces),
    relationships,
    conversationLauncher ?? {
      openConversation(request: HarnessConversationLaunchRequest) {
        if (request.sessionId !== undefined) runtime.sessions.open(request.sessionId)
        else runtime.workspaces.startSession()
      },
    },
  )
}

