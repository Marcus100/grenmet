import { MDXContent } from "@content-collections/mdx/react";

const components = {
  a: (props: React.ComponentProps<"a">) => (
    <a
      className="text-signal-green hover:text-signal-green-dark underline underline-offset-2"
      {...props}
    />
  ),
};

export function MdxContent({ code }: { code: string }) {
  return <MDXContent code={code} components={components} />;
}
