// Generated only by this batch owning importer. Static binding never activates a runtime role.
// Source list: design/characters/gemini-grok-production-20261002/static-identity-art.sources.json
export const STAGED_IDENTITY_ASSET_RECORDS = Object.freeze({
  "employee.gemini.avatar.v1": Object.freeze({
    id: "employee.gemini.avatar.v1" as const,
    kind: 'actor-static' as const, alpha: true,
    file: "gemini-avatar-v1.ed5e3f2333ae.png",
    sha256: "ed5e3f2333ae7af68803aff0e00278662157728a48091630fa8aaa0830c0bb82", bytes: 323079,
    dimensions: Object.freeze({ width: 512, height: 512 }),
  }),
  "employee.gemini.portrait.v1": Object.freeze({
    id: "employee.gemini.portrait.v1" as const,
    kind: 'actor-static' as const, alpha: true,
    file: "gemini-portrait-v1.2708354f3c36.png",
    sha256: "2708354f3c36d131995a42ff24aa43e29ba0ef0df222c1f04365645d23fbdda3", bytes: 2272302,
    dimensions: Object.freeze({ width: 1024, height: 1536 }),
  }),
  "employee.grok.avatar.v1": Object.freeze({
    id: "employee.grok.avatar.v1" as const,
    kind: 'actor-static' as const, alpha: true,
    file: "grok-avatar-v1.120e41940680.png",
    sha256: "120e4194068034fc90f33f1fd8b2e9470ba672904e146dea6a01d8ff0718211e", bytes: 408608,
    dimensions: Object.freeze({ width: 512, height: 512 }),
  }),
  "employee.grok.portrait.v1": Object.freeze({
    id: "employee.grok.portrait.v1" as const,
    kind: 'actor-static' as const, alpha: true,
    file: "grok-portrait-v1.974777974866.png",
    sha256: "974777974866c9d1f2cf21936478d587cc9b58335bbec0691a5faeace6e26f17", bytes: 2429381,
    dimensions: Object.freeze({ width: 1024, height: 1536 }),
  }),
})
export type StagedIdentityAssetId = keyof typeof STAGED_IDENTITY_ASSET_RECORDS
export const STAGED_IDENTITY_STATIC_ART = Object.freeze({
  gemini: Object.freeze({
    employeeId: "gemini" as const, displayName: "吉米",
    status: 'source-bound-inactive' as const, runtimeReady: false as const, visualAcceptance: 'pending' as const,
    portrait: "employee.gemini.portrait.v1" as const,
    avatar: "employee.gemini.avatar.v1" as const,
    scene: Object.freeze({ status: 'missing' as const, reason: "No independently authored scene is registered." }),
    actions: Object.freeze({ status: 'missing' as const, reason: "Complete action parity is not approved." }),
  }),
  grok: Object.freeze({
    employeeId: "grok" as const, displayName: "绯洛",
    status: 'source-bound-inactive' as const, runtimeReady: false as const, visualAcceptance: 'pending' as const,
    portrait: "employee.grok.portrait.v1" as const,
    avatar: "employee.grok.avatar.v1" as const,
    scene: Object.freeze({ status: 'missing' as const, reason: "No independently authored scene is registered." }),
    actions: Object.freeze({ status: 'missing' as const, reason: "Complete action parity is not approved." }),
  }),
})
export function getStagedIdentityStaticArt(value: unknown) {
  if (typeof value !== 'string' || !Object.hasOwn(STAGED_IDENTITY_STATIC_ART, value)) return undefined
  return STAGED_IDENTITY_STATIC_ART[value as keyof typeof STAGED_IDENTITY_STATIC_ART]
}
