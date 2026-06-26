import Image from "next/image";
import { ChevronDown, Download, Menu, MoreVertical } from "lucide-react";

export function Hero() {
  return (
    <section className="relative min-h-screen bg-black">
      <div className="absolute inset-0">
        <Image
          src="/assets/hero-mosaic.svg"
          alt="Cinematic AI video mosaic"
          fill
          priority
          sizes="100vw"
          className="scale-[1.04] object-cover opacity-85"
        />
        <video
          className="absolute inset-0 h-full w-full object-cover opacity-95"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster="/assets/hero-mosaic.svg"
          aria-hidden="true"
        >
          <source src="/assets/landing-hero-background.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-black/48" />
        <div className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-black via-black/70 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-80 bg-gradient-to-t from-black via-black/78 to-transparent" />
        <div className="absolute inset-y-0 left-0 w-40 bg-gradient-to-r from-black to-transparent" />
        <div className="absolute inset-y-0 right-0 w-40 bg-gradient-to-l from-black to-transparent" />
      </div>

      <header className="relative z-20 flex items-center justify-between px-5 py-6 md:px-9">
        <a href="#" className="text-2xl font-semibold tracking-[-0.055em] text-white md:text-4xl">
          flow
        </a>
        <nav className="hidden items-center gap-9 text-base font-medium tracking-[-0.035em] text-white/55 xl:flex">
          <a href="#features" className="transition hover:text-white">
            Overview
          </a>
          <a href="#models" className="transition hover:text-white">
            Models
          </a>
          <a href="#tutorials" className="transition hover:text-white">
            Capabilities
          </a>
          <a href="#features" className="transition hover:text-white">
            Tools
          </a>
          <a href="#showcase" className="transition hover:text-white">
            Flow Sessions
          </a>
          <a href="#pricing" className="transition hover:text-white">
            Pricing
          </a>
        </nav>
        <div className="hidden items-center gap-6 text-white md:flex">
          <span className="text-3xl leading-none">𝕏</span>
          <span className="grid size-8 place-items-center rounded-lg border-2 border-white text-sm font-bold">◎</span>
          <span className="grid size-8 place-items-center rounded-lg bg-[#dce3ff] text-sm font-black text-black">D</span>
          <MoreVertical size={32} />
        </div>
        <button className="grid size-10 place-items-center text-white md:hidden" type="button" aria-label="Open menu">
          <Menu />
        </button>
      </header>

      <div className="section-shell relative z-10 flex min-h-[calc(100vh-104px)] items-center justify-center pb-16 pt-14 text-center">
        <div className="max-w-7xl">
          <h1 className="text-[clamp(4.5rem,12vw,10.5rem)] font-black leading-[0.82] tracking-[-0.035em] text-white">
            <span className="inline-block origin-bottom scale-y-[1.05]">F</span>low
          </h1>
          <p className="mx-auto mt-10 max-w-4xl text-3xl font-normal leading-[1.05] tracking-[-0.055em] text-white md:text-5xl">
            Your AI creative studio built with advanced generative video models.
          </p>

          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <a
              href="/downloads/flow-extension.zip"
              download
              className="inline-flex h-16 items-center justify-center gap-2.5 rounded-full bg-white px-7 text-lg font-semibold tracking-[-0.035em] text-black shadow-[0_24px_80px_rgba(255,255,255,0.2)] transition hover:scale-[1.035] md:px-8 md:text-xl"
            >
              <Download size={20} strokeWidth={2.5} />
              Download Chrome Extension
            </a>
            <a
              href="https://labs.google/fx/tools/flow"
              className="inline-flex h-16 items-center justify-center rounded-full border border-white/35 bg-black/30 px-8 text-xl font-semibold tracking-[-0.035em] text-white backdrop-blur transition hover:scale-[1.035] hover:bg-white/10 md:px-10 md:text-2xl"
            >
              Create with VEO Flow
            </a>
          </div>

          <p className="mx-auto mt-10 max-w-5xl text-sm leading-6 text-white/45 md:text-base">
            Explore AI subscriptions. Features may vary by plan, platform, and region. 18+.
          </p>
        </div>
      </div>

      <ChevronDown className="absolute bottom-8 left-1/2 z-20 size-9 -translate-x-1/2 animate-bounce text-white/90" />
      <button
        type="button"
        className="absolute bottom-16 right-8 z-20 hidden size-20 place-items-center rounded-full border border-white/25 bg-white/10 text-3xl font-bold text-white shadow-card backdrop-blur md:grid"
        aria-label="Pause background animation"
      >
        II
      </button>
    </section>
  );
}
