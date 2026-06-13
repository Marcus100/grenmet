import { MDXContent } from "@content-collections/mdx/react";

const components = {
  a: (props: React.ComponentProps<"a">) => (
    <a
      className="text-signal-green underline underline-offset-2 hover:text-signal-green-dark"
      {...props}
    />
  ),
};

export function MdxContent({ code }: { code: string }) {
  return <MDXContent code={code} components={components} />;
}
