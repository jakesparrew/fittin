import Link from "next/link";

// The one pill-button primitive. Renders <Link> when `href` is set, else <button>. Variants + sizes
// match the most common existing hand-typed specs so adoption is a drop-in. Adopt opportunistically
// (new code + touched files) — no big-bang codemod.
const VARIANTS = {
  accent: "bg-accent text-brand shadow-lg shadow-accent/30 hover:-translate-y-0.5 hover:shadow-xl",
  brand: "bg-brand text-white hover:opacity-90",
  outline: "border-2 border-borderc text-brand hover:border-lav",
  ghost: "text-brand hover:bg-paper",
};
const SIZES = {
  sm: "px-5 py-2.5 text-sm",
  md: "px-7 py-3.5 text-base",
  lg: "px-8 py-4 text-lg",
};

export default function Button({ href, variant = "accent", size = "sm", className = "", children, ...rest }) {
  const cls = `inline-flex items-center justify-center gap-2 rounded-full font-black transition disabled:opacity-50 disabled:pointer-events-none ${VARIANTS[variant] || VARIANTS.accent} ${SIZES[size] || SIZES.sm} ${className}`;
  if (href) return <Link href={href} className={cls} {...rest}>{children}</Link>;
  return <button className={cls} {...rest}>{children}</button>;
}
