import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { contactDisplayName, MESSAGE_ROLE_IDS, type MessagePreferences } from '../messages-settings.ts'
import type { MessagesRuntime } from './messages-runtime.ts'

type Names = Readonly<Record<string,string | undefined>>
const empty: Names = Object.freeze({})
interface Directory {
  read(): Names
  subscribe(listener:()=>void): ()=>void
  openContact?(id:string): void
}
const Context = createContext<Directory>({ read:()=>empty, subscribe:()=>()=>{} })

export function ContactDirectory({messages,openContact,children}:{
  messages: MessagesRuntime; openContact(id:string):void; children: ReactNode
}) {
  const directory = useMemo<Directory>(() => {
    let previous: MessagePreferences | undefined
    let names = empty
    function read() {
      const prefs = messages.getSnapshot().preferences
      if (previous && prefs.contactAliases === previous.contactAliases && prefs.profiles === previous.profiles) return names
      previous = prefs
      const next: Record<string,string> = {}
      for (const id of MESSAGE_ROLE_IDS) {
        const display = contactDisplayName(prefs,id,'')
        if (display) next[id] = display
      }
      if (MESSAGE_ROLE_IDS.some(id=>next[id] !== names[id])) names = next
      return names
    }
    return { read, subscribe:messages.subscribe, openContact }
  }, [messages,openContact])
  return <Context.Provider value={directory}>{children}</Context.Provider>
}

export function useContactDirectory() {
  const directory = useContext(Context)
  const names = useSyncExternalStore(directory.subscribe,directory.read,directory.read)
  return { names, openContact:directory.openContact }
}
