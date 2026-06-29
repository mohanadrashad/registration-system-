// Section-group heading for public forms: a small-uppercase muted label with a
// thin flat 1px rule beneath. Rendered wherever a HEADING field appears — the
// public registration page and post-registration portal phases — so the
// section-header look stays consistent across both. Flat by design: no
// gradient or glow (those flicker on render). RTL is handled by the caller's
// `dir`; the label arrives already localized (labelAr in Arabic), and an
// uppercase transform is a no-op on Arabic text.
export function SectionHeading({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </h3>
      <div className="mt-2 h-px w-full bg-gray-200" />
    </div>
  );
}
