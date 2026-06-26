import Image from "next/image";
import { Play } from "lucide-react";
import { SectionHeading } from "./SectionHeading";

const tutorials = [
  {
    title: "1. Extension Installation & Setup",
    image: "/assets/tutorial-installation.svg",
    duration: "03:20",
  },
  {
    title: "2. How to Login with Virtual Email",
    image: "/assets/tutorial-login.svg",
    duration: "04:15",
  },
  {
    title: "3. Generating Your First AI Video",
    image: "/assets/tutorial-generate.svg",
    duration: "05:40",
  },
];

export function VideoTutorials() {
  return (
    <section id="tutorials" className="relative border-b border-line py-20 md:py-28">
      <div className="absolute inset-x-0 top-1/2 h-80 -translate-y-1/2 bg-radial-violet opacity-80" />
      <div className="section-shell relative">
        <SectionHeading
          eyebrow="How to get started"
          title="Launch like a creator studio."
          description="A prominent video center that walks users from extension setup to their first cinematic generation."
        />

        <div className="grid gap-5 lg:grid-cols-3">
          {tutorials.map((tutorial) => (
            <article key={tutorial.title} className="video-card glass-card overflow-hidden rounded-2xl">
              <div className="group relative aspect-video overflow-hidden bg-black">
                <Image src={tutorial.image} alt={tutorial.title} fill sizes="(min-width: 1024px) 33vw, 100vw" className="object-cover transition duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/5 to-cyan/10" />
                <div className="absolute left-0 right-0 top-0 h-1 bg-gradient-to-r from-transparent via-cyan to-transparent opacity-80" />
                <button
                  type="button"
                  className="absolute left-1/2 top-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/25 bg-white/15 text-white shadow-glow backdrop-blur transition group-hover:scale-110"
                  aria-label={`Play ${tutorial.title}`}
                >
                  <Play size={22} fill="currentColor" />
                </button>
                <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-white backdrop-blur">
                  {tutorial.duration}
                </span>
              </div>
              <div className="p-5 text-center">
                <h3 className="text-base font-black text-white">{tutorial.title}</h3>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
