// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createOfficeTimePolicy } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/timePolicy.ts'
import { employeeLocation, withActiveTaskMonitors } from '../src/client/office-presence.ts'
import { decodeOfficePresentationSettings } from '../src/office-presentation-settings.ts'

describe('office scene membership without task or attendance authority', () => {
  it.each([
    [8, 'bedroom'], [9, 'office'], [11, 'office'], [12, 'office'], [13, 'office'], [17, 'office'], [18, 'bedroom'], [23, 'bedroom'],
  ] as const)('puts an idle employee in exactly one room at %i', (hour, location) => {
    const policy = createOfficeTimePolicy({ date: new Date(2026, 10, 19, hour) })
    expect(employeeLocation(policy, false, true)).toBe(location)
    expect(employeeLocation(policy, false, false)).toBe('unknown')
    expect(employeeLocation(policy, true, true)).toBe('office')
    expect(withActiveTaskMonitors(policy, false)).toBe(policy)
  })

  it('applies holidays and weekends, and lights just the overtime desk after hours', () => {
    const dates = [new Date(2026,10,22,11), new Date(2026,10,19,11), new Date(2026,10,19,23)]
    for (const date of dates) {
      const policy = createOfficeTimePolicy({ date, calendar:{schemaVersion:1,restDates:['2026-11-19']} })
      expect(employeeLocation(policy, false, true)).toBe('bedroom')
      expect(employeeLocation(policy, true, true)).toBe('office')
      expect(withActiveTaskMonitors(policy,true)).toMatchObject({ attendancePeriod:'off-duty', charactersPresent:false,
        bedtime:date.getHours()===23, monitors:{mode:'active-tasks-only',boundWorkstationsOn:false,activeTaskWorkstationsOn:true} })
    }
  })
  it('retains old selection documents and rejects unknown membership values before writing', () => {
    const old = { selection: { schemaVersion: 1, officeTheme: null, employeeSkins: {} } }
    expect(decodeOfficePresentationSettings(old)).toEqual(old)
    for (const presence of ['all', 'schedule']) {
      expect(decodeOfficePresentationSettings({ selection: { ...old.selection, presence } })?.selection?.presence).toBe(presence)
    }
    for (const presence of ['working', 'everyone-is-running', null, 1]) {
      expect(decodeOfficePresentationSettings({ selection: { ...old.selection, presence } })).toBeUndefined()
    }
    expect(decodeOfficePresentationSettings({ selection: { ...old.selection, attendancePeriod: 'working' } })).toBeUndefined()
  })
})
