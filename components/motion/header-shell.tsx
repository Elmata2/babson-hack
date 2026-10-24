'use client'

import { useEffect, useState } from 'react'

const THRESHOLD = 24

export function HeaderShell({
  children,
  quietAtTop = false,
}: {
  children: React.ReactNode
  quietAtTop?: boolean
}) {
  const [scrolled, setScrolled] = useState(!quietAtTop)

  useEffect(() => {
    if (!quietAtTop) return
    let frame = 0
    const read = () => {
      frame = 0
      setScrolled(window.scrollY > THRESHOLD)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read)
    }
    read()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [quietAtTop])

  return (
    <header
      data-scrolled={scrolled}
      className="header-shell sticky top-0 z-40 border-b border-transparent data-[scrolled=true]:border-rule data-[scrolled=true]:bg-paper/80 data-[scrolled=true]:backdrop-blur-md"
    >
      {children}
    </header>
  )
}
