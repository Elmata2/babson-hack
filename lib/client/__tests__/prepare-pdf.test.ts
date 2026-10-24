import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { prepareUploadFiles } from '../prepare-image'

const pdfMock = vi.hoisted(() => ({ getDocument: vi.fn() }))

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: pdfMock.getDocument,
}))

const originalDocument = globalThis.document

function fakePdf(pages: number) {
  const render = vi.fn(() => ({ promise: Promise.resolve() }))
  const cleanup = vi.fn()
  const getPage = vi.fn(async () => ({
    getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
    render,
    cleanup,
  }))
  const destroy = vi.fn(async () => undefined)
  pdfMock.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: pages, getPage }), destroy })
  return { render, cleanup, getPage, destroy }
}

beforeEach(() => {
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({}),
    toBlob: (callback: (blob: Blob) => void) => callback(new Blob(['jpeg-page'], { type: 'image/jpeg' })),
  }
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => canvas },
  })
})

afterEach(() => {
  Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument })
  pdfMock.getDocument.mockReset()
})

describe('PDF upload preparation', () => {
  it('sends JPEG pages to vision route instead of original PDF', async () => {
    const pdf = fakePdf(2)
    const file = new File(['PDF bytes'], 'statement.pdf', { type: 'application/pdf' })
    const prepared = await prepareUploadFiles([file])

    expect(prepared.map((page) => page.name)).toEqual(['statement-page-1.jpg', 'statement-page-2.jpg'])
    expect(prepared.every((page) => page.type === 'image/jpeg')).toBe(true)
    expect(pdf.render).toHaveBeenCalledTimes(2)
    expect(pdf.destroy).toHaveBeenCalledOnce()
  })

  it('rejects PDF pages beyond the three-page upload limit', async () => {
    const pdf = fakePdf(4)
    const file = new File(['PDF bytes'], 'statement.pdf', { type: 'application/pdf' })

    await expect(prepareUploadFiles([file])).rejects.toThrow(/4 pages.*at most 3/i)
    expect(pdf.render).not.toHaveBeenCalled()
    expect(pdf.destroy).toHaveBeenCalledOnce()
  })

  it('counts photos against remaining PDF pages', async () => {
    const pdf = fakePdf(3)
    const photo = new File(['jpeg'], 'cover.jpg', { type: 'image/jpeg' })
    const file = new File(['PDF bytes'], 'statement.pdf', { type: 'application/pdf' })

    await expect(prepareUploadFiles([photo, file])).rejects.toThrow(/at most 3/i)
    expect(pdf.render).not.toHaveBeenCalled()
  })
})
