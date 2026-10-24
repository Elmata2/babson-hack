export const MAX_BILL_BYTES = 4 * 1024 * 1024
export const BILL_BODY_OVERHEAD_BYTES = 64 * 1024

export function billTooLarge(contentLength: string | null): boolean {
  const declared = Number(contentLength)
  return Number.isFinite(declared) && declared > MAX_BILL_BYTES + BILL_BODY_OVERHEAD_BYTES
}
