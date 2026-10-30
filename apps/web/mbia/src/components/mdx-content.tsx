import { MDXContent } from "@content-collections/mdx/react";

const components = {
  a: (props: React.ComponentProps<"a">) => (
    <a
      className="text-gaa-sea hover:text-gaa-navy underline underline-offset-2"
      {...props}
    />
  ),
};

export function MdxContent({ code }: { code: string }) {
  return <MDXContent code={code} components={components} />;
}
