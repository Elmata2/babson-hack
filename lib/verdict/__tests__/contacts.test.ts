import { describe, expect, it } from 'vitest'

import contactsJson from '../../../data/rules/contacts-2026.json'
import { contactUtilityFor, contactsBlock, isCapeLightTown, type ContactsInput } from '../contacts'

const base: ContactsInput = { fuel: 'oil', dealer: null, utility: 'eversource', capeLight: false, recommendation: 'switch', supplyShoppable: true }

describe('contacts data', () => {
  it('has a dated source and an https url on every entry, and no email', () => {
    for (const entry of contactsJson.contacts) {
      expect(entry.url).toMatch(/^https:\/\//)
      expect(entry.readOn).toBe('2026-10-24')
      expect(entry.source.length).toBeGreaterThan(10)
      expect(JSON.stringify(entry)).not.toMatch(/@/)
    }
  })
})

describe('contactsBlock', () => {
  it('names fuel, dealer and utility on the Now line', () => {
    expect(contactsBlock({ ...base, dealer: 'Acme Oil' }).now).toBe('Now: Oil heating, from Acme Oil; electricity delivered by Eversource.')
    expect(contactsBlock({ ...base, fuel: 'gas', utility: null }).now).toBe('Now: Gas heating; electricity utility not confirmed yet.')
  })

  it('switch: assessment, installers, loan, income line in order with tel and https links', () => {
    const { items } = contactsBlock(base)
    expect(items.map((entry) => entry.title)).toEqual([
      'Book a no-cost Home Energy Assessment',
      'Get installer quotes',
      'Questions about heat pump rebates',
      'Finance it',
      'Income verification for enhanced offers',
    ])
    expect(items[0]!.phone).toEqual({ display: '866-527-7283', href: 'tel:+18665277283' })
    expect(items[1]!.phone).toBeNull()
    expect(items[2]!.phone?.display).toBe('888-855-0340')
    expect(items[4]!.phone?.display).toBe('888-714-3990')
    for (const entry of items) {
      for (const link of entry.links) expect(link.href).toMatch(/^https:\/\/www\.masssave\.com/)
      expect(entry.sources.length).toBeGreaterThan(0)
    }
  })

  it('stay: utility, supply when shoppable, dealer for oil and propane', () => {
    const titles = contactsBlock({ ...base, recommendation: 'stay', dealer: 'Acme Oil' }).items.map((entry) => entry.title)
    expect(titles).toEqual(['Ask Eversource about your bill', 'Compare electricity supply', 'Ask Acme Oil for a price'])
  })

  it('stay: gas has no dealer line, unshoppable supply has no Energy Switch line', () => {
    const titles = contactsBlock({ ...base, fuel: 'gas', recommendation: 'stay', supplyShoppable: false, utility: 'unitil' }).items.map((entry) => entry.title)
    expect(titles).toEqual(['Ask Unitil about your bill'])
  })

  it('stay: a phone is shown only where one is sourced', () => {
    const unitil = contactsBlock({ ...base, recommendation: 'stay', utility: 'unitil' }).items[0]!
    const eversource = contactsBlock({ ...base, recommendation: 'stay', utility: 'eversource' }).items[0]!
    expect(unitil.phone?.display).toBe('888-301-7700')
    expect(eversource.phone).toBeNull()
    expect(eversource.links).toHaveLength(1)
  })

  it('municipal light plant: Mass Save does not apply, no phone, no links, no invented number', () => {
    const { items } = contactsBlock({ ...base, utility: 'municipal', recommendation: 'stay', supplyShoppable: false })
    expect(items[0]!.detail).toMatch(/Mass Save rebates do not apply/)
    expect(items[0]!.phone).toBeNull()
    expect(items[0]!.links).toEqual([])
    expect(items.map((entry) => entry.title)).toEqual(['Contact your municipal light plant', 'Ask your dealer for a price'])
  })
})

describe('contactUtilityFor', () => {
  it('prefers the bill, then a single sponsor, and refuses to guess a mixed town', () => {
    expect(contactUtilityFor('national_grid', ['eversource'])).toBe('nationalgrid')
    expect(contactUtilityFor(null, ['unitil'])).toBe('unitil')
    expect(contactUtilityFor(null, ['cape_light', 'eversource'])).toBe('eversource')
    expect(contactUtilityFor(null, ['eversource', 'municipal'])).toBeNull()
    expect(contactUtilityFor(null, ['cape_light'])).toBe('eversource')
    expect(contactUtilityFor('oil_dealer', [])).toBeNull()
  })
})

describe('Cape Light and unknown utility', () => {
  it('never says delivered by Cape Light Compact and routes bill questions to Eversource', () => {
    const input = { ...base, capeLight: true, recommendation: 'stay' as const }
    const block = contactsBlock(input)
    expect(block.now).toBe('Now: Oil heating; electricity delivered by Eversource; efficiency programs by Cape Light Compact.')
    expect(block.items.map((entry) => entry.title)).toEqual([
      'Ask Eversource about your bill',
      'Cape Light Compact general questions',
      'Compare electricity supply',
      'Ask your dealer for a price',
    ])
    expect(block.items[1]!.phone?.display).toBe('508-375-6644')
    expect(isCapeLightTown(['cape_light', 'eversource'])).toBe(true)
  })

  it('unknown utility points to the electric bill', () => {
    const { items } = contactsBlock({ ...base, utility: null, recommendation: 'stay', supplyShoppable: false, fuel: 'gas' })
    expect(items.map((entry) => entry.title)).toEqual(["Check your electric bill for your utility's customer service number"])
  })
})
