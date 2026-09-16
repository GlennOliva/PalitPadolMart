import { describe, it, expect, beforeEach, vi } from 'vitest'
import { sanitizeCsvCell, buildCsv, downloadCsv } from '../../src/utils/csv'

describe('sanitizeCsvCell', () => {
  it('serializes primitive values', () => {
    expect(sanitizeCsvCell('hello')).toBe('hello')
    expect(sanitizeCsvCell(42)).toBe('42')
    expect(sanitizeCsvCell(null)).toBe('')
    expect(sanitizeCsvCell(undefined)).toBe('')
  })

  it('prefixes formula-injection leads with a quote', () => {
    expect(sanitizeCsvCell('=1+1')).toBe("'=1+1")
    expect(sanitizeCsvCell('+44 20 7946 0958')).toBe("'+44 20 7946 0958")
    expect(sanitizeCsvCell('-sum(A1:A2)')).toBe("'-sum(A1:A2)")
    expect(sanitizeCsvCell('@cmd')).toBe("'@cmd")
  })

  it('does not perturb safe strings', () => {
    expect(sanitizeCsvCell('Pixel Pro 11')).toBe('Pixel Pro 11')
    expect(sanitizeCsvCell('not-a-formula')).toBe('not-a-formula')
  })
})

describe('buildCsv', () => {
  it('joins header and rows with commas and newlines', () => {
    const csv = buildCsv(['A', 'B'], [[1, 'x'], [2, 'y']])
    expect(csv).toBe(['A,B', '1,x', '2,y'].join('\n'))
  })

  it('quotes cells containing commas, quotes, or newlines', () => {
    const csv = buildCsv(['name', 'note'], [['A, B', 'he said "hi"'], ['C', 'line1\nline2']])
    expect(csv).toContain('"A, B"')
    expect(csv).toContain('"he said ""hi"""')
    expect(csv).toContain('"line1\nline2"')
  })

  it('sanitizes every cell including headers', () => {
    const csv = buildCsv(['=cmd', 'safe'], [['+42', 'ok']])
    expect(csv).toContain("'=cmd")
    expect(csv).toContain("'+42")
  })
})

describe('downloadCsv', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('builds a blob link and clicks it', () => {
    const client = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi.fn()
    const createElement = vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      click,
    } as unknown as HTMLAnchorElement)
    const append = vi.spyOn(document.body, 'appendChild').mockImplementation(() => ({} as never))
    const remove = vi.spyOn(document.body, 'removeChild').mockImplementation(() => ({} as never))

    downloadCsv('out.csv', 'a,b\n1,2')

    expect(client).toHaveBeenCalled()
    expect(createElement).toHaveBeenCalled()
    expect(click).toHaveBeenCalled()
    expect(revoke).toHaveBeenCalled()
    expect(append).toHaveBeenCalled()
    expect(remove).toHaveBeenCalled()
  })
})