/** App name with the S and R picked out in the accent colour. */
export function BrandName({ className = "" }: { className?: string }) {
  return (
    <span className={className}>
      <span className="text-primary">S</span>
      <span>chool</span>
      <span className="text-primary">R</span>
      <span>ise</span>
    </span>
  );
}

export const APP_NAME = "SchoolRise";
