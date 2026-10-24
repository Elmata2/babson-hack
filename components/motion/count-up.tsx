'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const NUMBER = /\d[\d,]*(?:\.\d+)?/g
const DURATION_MS = 1100

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t))

function targets(value: string) {
  return Array.from(value.matchAll(NUMBER), ([text]) => ({
    decimals: text.includes('.') ? text.length - text.indexOf('.') - 1 : 0,
    target: Number(text.replaceAll(',', '')),
  }))
}

function render(value: string, progress: number) {
  const found = targets(value)
  let i = 0
  return value.replace(NUMBER, () => {
    const { target, decimals } = found[i++]!
    return (target * progress).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  })
}

const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect

export function CountUp({
  value,
  className = '',
  delayMs = 0,
}: {
  value: string
  className?: string
  delayMs?: number
}) {
  const [shown, setShown] = useState(value)
  const frame = useRef(0)

  useBeforePaint(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (targets(value).length === 0) return
    setShown(render(value, 0))
    let start = 0
    const tick = (now: number) => {
      start ||= now
      const t = Math.min((now - start) / DURATION_MS, 1)
      setShown(render(value, easeOutExpo(t)))
      if (t < 1) frame.current = requestAnimationFrame(tick)
    }
    const timer = setTimeout(() => {
      frame.current = requestAnimationFrame(tick)
    }, delayMs)
    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(frame.current)
    }
  }, [value, delayMs])

  return (
    <span className={`tabular-nums ${className}`}>
      <span className="sr-only">{value}</span>
      <span aria-hidden>{shown}</span>
    </span>
  )
}
