import Image from "next/image";
import { Play } from "lucide-react";

export function ProductShowcase() {
  return (
    <section id="showcase" className="relative border-b border-line bg-black py-20 md:py-28">
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black to-transparent" />
      <div className="section-shell relative">
        <h2 className="mx-auto max-w-4xl text-center text-5xl font-semibold leading-[0.98] tracking-[-0.07em] text-white md:text-8xl">
          Unlock your best creative work
        </h2>

        <div className="cinema-frame mx-auto mt-[-10px] max-w-6xl rounded-[2rem] p-3 md:mt-[-18px] md:p-4">
          <div className="relative aspect-[16/9] overflow-hidden rounded-[1.35rem] bg-black">
            <Image
              src="/assets/betta-fish-ui-4k.png"
              alt="Betta fish creative studio interface preview"
              fill
              sizes="(min-width: 1024px) 1120px, 100vw"
              className="object-contain"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-black/15" />
            <button
              type="button"
              aria-label="Play product overview"
              className="absolute left-1/2 top-1/2 grid size-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white shadow-[0_0_70px_rgba(125,211,252,0.28)] backdrop-blur-md transition hover:scale-110"
            >
              <Play size={42} fill="currentColor" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
