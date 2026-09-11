import Link from "next/link";

type AccessCardProps = {
  title: string;
  description: string;
  href: string;
  icon: string;
  disabled?: boolean;
};

export function AccessCard({
  title,
  description,
  href,
  icon,
  disabled = false,
}: AccessCardProps) {
  const content = (
    <div
      className={`
        group
        rounded-3xl
        border
        border-white/10
        bg-white/[0.05]
        p-6
        transition
        ${
          disabled
            ? "cursor-not-allowed opacity-40"
            : "hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.08]"
        }
      `}
    >
      <div className="text-4xl">
        {icon}
      </div>

      <h2 className="mt-5 text-xl font-black uppercase tracking-tight text-white">
        {title}
      </h2>

      <p className="mt-2 text-sm leading-6 text-slate-400">
        {description}
      </p>

      <div className="mt-5 text-xs font-black uppercase tracking-widest text-sky-300">
        {disabled
          ? "Próximamente"
          : "Ingresar →"}
      </div>
    </div>
  );

  if (disabled) {
    return content;
  }

  return (
    <Link href={href}>
      {content}
    </Link>
  );
}
