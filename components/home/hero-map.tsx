export function HeroMap() {
  return (
    <div
      aria-hidden
      className="hero-map pointer-events-none absolute right-0 top-0 aspect-[1000/620] w-[70%] select-none opacity-60 sm:w-[52%] lg:inset-y-0 lg:aspect-auto lg:w-[42%] lg:opacity-70"
    >
      <div className="absolute inset-0 bg-[url('/home-map.svg')] bg-contain bg-center bg-no-repeat" />
    </div>
  )
}
