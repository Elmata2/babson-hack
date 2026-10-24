'use client'

import { useEffect, useRef } from 'react'

interface RevealProps {
  children: React.ReactNode
  index?: number
  className?: string
}

export function Reveal({ children, index = 0, className = '' }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return

    el.dataset.reveal = 'pending'
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        el.dataset.reveal = 'in'
        observer.disconnect()
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`reveal ${className}`}
      style={{ '--i': index } as React.CSSProperties}
    >
      {children}
    </div>
  )
}
