import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { ProviderMark, providerKind } from '../src/client/ProviderMark.tsx'
import type { AgentConfig } from '../src/client/agent-desk-api.ts'

it('uses the configured service identity for a role and keeps third-party endpoints distinct',()=>{
  const binding:AgentConfig={model:'gpt-dev',baseUrl:'http://localhost:3000',source:'custom',hasKey:false}
  expect(providerKind(binding)).toBe('custom')
  expect(providerKind({...binding,baseUrl:'https://api.openai.com.other.test'})).toBe('custom')
  expect(providerKind({...binding,baseUrl:'https://api.openai.com/v1'})).toBe('openai')
  expect(providerKind({...binding,source:'dsh',provider:'custom-dsh'})).toBe('dsh')
  expect(providerKind({...binding,source:'local',provider:'codex'})).toBe('openai')
  expect(providerKind({...binding,source:'local',provider:'claude'})).toBe('claude')
  expect(providerKind({...binding,source:'local',provider:'external'})).toBe('local')
  expect(providerKind(undefined)).toBe('unknown')
})

it('offers a named standalone logo and keeps the decorative version out of the accessibility tree',()=>{
  const name=renderToStaticMarkup(<ProviderMark kind="openai" label="ChatGPT"/>)
  expect(name).toContain('role="img"');expect(name).toContain('aria-label="ChatGPT"')
  expect(renderToStaticMarkup(<ProviderMark kind="claude"/>)).toContain('aria-hidden="true"')
})
