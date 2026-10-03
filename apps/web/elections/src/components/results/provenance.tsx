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
    <p className="mt-2 text-base text-el-muted leading-relaxed">
      {!official && (
        <span className="mr-1.5 inline-block rounded-[2px] border border-el-rule-2 px-1 font-semibold text-el-ink-2 text-sm uppercase tracking-[0.06em]">
          Not officially sourced
        </span>
      )}
      <b className="text-el-ink-2">Source:</b> {text}.
      {children && <> {children}</>}
    </p>
  );
}
