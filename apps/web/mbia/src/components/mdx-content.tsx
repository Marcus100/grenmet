import { MDXContent } from "@content-collections/mdx/react";

const components = {
  a: (props: React.ComponentProps<"a">) => (
    <a
      className="text-gaa-sea underline underline-offset-2 hover:text-gaa-navy"
      {...props}
    />
  ),
};

export function MdxContent({ code }: { code: string }) {
  return <MDXContent code={code} components={components} />;
}
