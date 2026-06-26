type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  description: string;
};

export function SectionHeading({ eyebrow, title, description }: SectionHeadingProps) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center md:mb-14">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-violet-300">{eyebrow}</p>
      <h2 className="text-3xl font-black tracking-tight text-ink md:text-5xl">{title}</h2>
      <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-smoke md:text-base">{description}</p>
    </div>
  );
}
