export const APP_NAME = "SchoolRise";

/** App name with the S and R picked out in an accent colour. */
export function BrandName({
  className = "",
  accentClass = "text-primary",
}: {
  className?: string;
  accentClass?: string;
}) {
  return (
    <span className={className}>
      <span className={accentClass}>S</span>chool<span className={accentClass}>R</span>ise
    </span>
  );
}
