export function HeroMap() {
  return (
    <>
      <div aria-hidden className="hero-orb -left-40 -top-32 h-[420px] w-[420px]" data-tone="heat" />
      <div
        aria-hidden
        className="hero-orb -bottom-48 right-[-10%] h-[480px] w-[480px]"
        data-tone="switch"
      />
      <div
        aria-hidden
        className="hero-map pointer-events-none absolute inset-0 select-none opacity-50 sm:opacity-100"
      >
        <div className="absolute inset-x-[2%] top-2 h-[55%] bg-[url('/home-map.svg')] bg-contain bg-[position:50%_0] bg-no-repeat sm:inset-x-auto sm:bottom-[14%] sm:top-[3%] sm:right-[2%] sm:h-auto sm:w-[72%] sm:bg-[position:100%_50%]" />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/5 bg-gradient-to-b from-transparent to-paper"
      />
    </>
  )
}
