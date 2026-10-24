/**
 * @built F-107 client image prep — shrink the photo before it travels
 *
 * A modern phone photo is 3–8 MB of HEIC or JPEG. Vercel rejects a request body
 * over 4.5 MB with a non-JSON 413, and the vision model gains nothing from more
 * than ~2000 px on the long edge (bill text is read at that size fine). So the
 * browser decodes (honouring EXIF rotation — a sideways bill reads worse), scales
 * down, and re-encodes to JPEG before upload.
 *
 * The decisions are pure and unit-tested (`planPrepare`, `fitWithin`,
 * `nextQuality`, `checkTotalSize`). Only `prepareFile` touches canvas, and it
 * degrades to "send as-is" whenever the browser cannot decode the file — the
 * route then answers a clear 415 for HEIC instead of failing here.
 */

/** Long edge after scaling. */
export const MAX_EDGE = 2_000
/** Re-encoded images aim below this; PDFs are not re-encoded. */
export const TARGET_BYTES = 1.5 * 1024 * 1024
/** Vercel's body limit is 4.5 MB; leave room for multipart framing and fields. */
export const MAX_TOTAL_BYTES = 4 * 1024 * 1024
export const MAX_FILES = 3
export const QUALITY_START = 0.85
export const QUALITY_FLOOR = 0.6
/** Descending ladder from the start quality to the floor. */
const QUALITY_LADDER = [QUALITY_START, 0.75, 0.68, QUALITY_FLOOR] as const

export type PreparePlan =
  /** Decode, scale, re-encode. */
  | { action: 'reencode' }
  /** Send untouched (PDF within limits, or a type we cannot decode). */
  | { action: 'passthrough' }
  /** Refuse before upload, with a sentence the UI can show. */
  | { action: 'reject'; message: string }

export interface FileFacts {
  name: string
  type: string
  size: number
}

export function isHeic(file: Pick<FileFacts, 'name' | 'type'>): boolean {
  return /^image\/hei[cf]$/i.test(file.type) || /\.hei[cf]$/i.test(file.name)
}

export function isPdf(file: Pick<FileFacts, 'name' | 'type'>): boolean {
  return file.type === 'application/pdf' || (file.type === '' && /\.pdf$/i.test(file.name))
}

/** What to do with one chosen file. Pure: sizes and types in, a decision out. */
export function planPrepare(file: FileFacts): PreparePlan {
  if (isPdf(file)) {
    return file.size < MAX_TOTAL_BYTES
      ? { action: 'passthrough' }
      : {
          action: 'reject',
          message: 'That PDF is over 4 MB, which is more than the upload allows. Photograph the bill page instead.',
        }
  }
  if (file.type.startsWith('image/') || isHeic(file)) return { action: 'reencode' }
  return { action: 'passthrough' }
}

/** Scale (width, height) so the long edge is at most `maxEdge`; never upscale. */
export function fitWithin(width: number, height: number, maxEdge: number = MAX_EDGE): { width: number; height: number } {
  const longEdge = Math.max(width, height)
  if (longEdge <= maxEdge || longEdge <= 0) return { width, height }
  const scale = maxEdge / longEdge
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/**
 * The next JPEG quality to try after one that was still too big, or `null` when
 * the floor is reached (then the last attempt is used, or sent as-is if smaller).
 */
export function nextQuality(current: number): number | null {
  return QUALITY_LADDER.find((q) => q < current - 1e-9) ?? null
}

/** Whole upload must fit one request. Returns a message, or null when fine. */
export function checkTotalSize(sizes: number[]): string | null {
  if (sizes.length > MAX_FILES) return `Attach at most ${MAX_FILES} pages or photos of one bill.`
  const total = sizes.reduce((sum, size) => sum + size, 0)
  return total > MAX_TOTAL_BYTES
    ? 'Those files add up to more than 4 MB. Send fewer pages, or photograph them closer.'
    : null
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}

/**
 * Browser-only. Returns the file to upload: a smaller JPEG when decoding works,
 * otherwise the original (the route decides whether it can read it).
 */
export async function prepareFile(file: File): Promise<File> {
  if (planPrepare(file).action !== 'reencode') return file
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return file // e.g. HEIC outside Safari: let the route say "export as JPG"
  }

  try {
    const canvas = document.createElement('canvas')
    let best: Blob | null = null
    // A noisy photo can exceed 1.5 MB even at the quality floor. Reduce the
    // dimensions in stages so a readable 2000px version wins whenever it fits.
    for (const edge of [MAX_EDGE, 1600, 1280, 1024, 800]) {
      const { width, height } = fitWithin(bitmap.width, bitmap.height, edge)
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) return file
      context.drawImage(bitmap, 0, 0, width, height)
      let quality: number | null = QUALITY_START
      while (quality !== null) {
        const blob = await canvasToBlob(canvas, quality)
        if (!blob) break
        if (!best || blob.size < best.size) best = blob
        if (blob.size <= TARGET_BYTES) {
          best = blob
          break
        }
        quality = nextQuality(quality)
      }
      if (best && best.size <= TARGET_BYTES) break
    }
    if (!best) return file
    // Keep the original if re-encoding somehow grew a small, already-fine JPEG.
    if (best.size >= file.size && file.type === 'image/jpeg' && file.size <= TARGET_BYTES) return file
    const name = file.name.replace(/\.[^.]+$/, '') || 'bill'
    return new File([best], `${name}.jpg`, { type: 'image/jpeg' })
  } finally {
    bitmap.close()
  }
}
