import { Download, LogIn, Sparkles } from "lucide-react";

const steps = [
  {
    number: "01",
    title: "Install the Extension",
    description: "Download the extension, add it to Chrome, then pin it.",
    icon: Download,
    accent: "linear-gradient(135deg, #22d3ee 0%, #3b82f6 100%)",
  },
  {
    number: "02",
    title: "Login and Sync",
    description: "Login once. Your plan, credits, and device sync automatically.",
    icon: LogIn,
    accent: "linear-gradient(135deg, #a78bfa 0%, #ec4899 100%)",
  },
  {
    number: "03",
    title: "Open Flow and Create",
    description: "Open Flow, click generate, and start creating with your plan.",
    icon: Sparkles,
    accent: "linear-gradient(135deg, #34d399 0%, #22d3ee 100%)",
  },
];

export function HowItWorks() {
  return (
    <section className="relative overflow-hidden border-b border-white/10 bg-[#070710] py-14 md:py-20">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(168,85,247,0.16),transparent_28rem),radial-gradient(circle_at_82%_18%,rgba(34,211,238,0.12),transparent_28rem)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/35 to-transparent" />
      <div className="section-shell">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-3 text-[0.68rem] font-bold uppercase tracking-[0.32em] text-cyan-200/70">Simple setup</p>
          <h2 className="text-[clamp(2.3rem,4.6vw,4.2rem)] font-black leading-none tracking-[-0.055em] text-white">
            How It Works
          </h2>
          <p className="mt-4 text-base leading-7 tracking-[-0.02em] text-white/48 md:text-lg">
            Get started in 3 simple steps
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {steps.map(({ number, title, description, icon: Icon, accent }) => (
            <article
              key={number}
              className="group relative min-h-[230px] overflow-hidden rounded-lg border border-white/10 bg-[#0d0d16]/82 p-5 shadow-[0_20px_80px_rgba(0,0,0,0.28)] backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-cyan-200/35 hover:bg-white/[0.06]"
            >
              <div className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />
              <div className="flex items-start justify-between gap-4">
                <span
                  className="inline-flex min-w-[5.8rem] justify-center rounded-xl px-3 py-1 text-[clamp(2.55rem,4.3vw,3.75rem)] font-black leading-none tracking-[-0.075em] text-black shadow-[0_0_34px_rgba(34,211,238,0.32)] ring-1 ring-white/35"
                  style={{ background: accent }}
                >
                  {number}
                </span>
                <span className="grid size-9 shrink-0 place-items-center rounded-md border border-white/12 bg-white/[0.055] text-white/70 transition group-hover:border-cyan-200/40 group-hover:text-cyan-100">
                  <Icon size={17} strokeWidth={2.4} />
                </span>
              </div>

              <div className="mt-9">
                <h3 className="text-lg font-black tracking-[-0.035em] text-white md:text-xl">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-white/52">{description}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
