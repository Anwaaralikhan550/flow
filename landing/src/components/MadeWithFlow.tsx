const stats = [
  ["0K+", "Active creators"],
  ["0M+", "Generations completed"],
  ["0%", "Platform uptime"],
  ["0 min", "Avg. generation time"],
];

const models = ["Veo 3.1", "Imagen 4", "Nano Banana", "Nano Banana 2 Pro", "Google Flow"];

export function MadeWithFlow() {
  return (
    <section className="border-b border-line bg-black py-16 md:py-20">
      <div className="section-shell text-center">
        <h2 className="text-3xl font-semibold tracking-[-0.055em] text-white md:text-5xl">Made with Flow</h2>
        <p className="mt-3 text-sm text-white/45 md:text-base">See what creators are building with AI video generation</p>

        <div className="mx-auto mt-12 grid max-w-5xl grid-cols-2 gap-8 md:grid-cols-4">
          {stats.map(([value, label]) => (
            <div key={label}>
              <strong className="block text-3xl font-semibold tracking-[-0.05em] text-white md:text-5xl">{value}</strong>
              <span className="mt-2 block text-xs font-semibold uppercase tracking-[0.12em] text-white/45">{label}</span>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-14 max-w-5xl overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_18%,black_82%,transparent)]">
          <div className="flex w-max animate-[marquee_22s_linear_infinite] gap-10 text-xl font-semibold tracking-[-0.04em] text-white/55">
            {[...models, ...models, ...models].map((model, index) => (
              <span key={`${model}-${index}`}>{model}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
