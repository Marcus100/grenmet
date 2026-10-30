/** The source line under every result, marking secondary data where it is shown. */
export function Provenance({
  text,
  official,
  children,
}: {
  text: string;
  official: boolean;
  children?: React.ReactNode;
}) {
  return (
    <p className="text-el-muted mt-2 text-base leading-relaxed">
      {!official && (
        <span className="border-el-rule-2 text-el-ink-2 mr-1.5 inline-block rounded-[2px] border px-1 text-sm font-semibold tracking-[0.06em] uppercase">
          Not officially sourced
        </span>
      )}
      <b className="text-el-ink-2">Source:</b> {text}.
      {children && <> {children}</>}
    </p>
  );
}
