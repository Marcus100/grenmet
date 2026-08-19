import { MDXContent } from "@content-collections/mdx/react";

import { Button } from "@/components/Button";
import {
  Code as CodeComponent,
  CodeGroup,
  Pre as pre,
} from "@/components/Code";
import { Guides } from "@/components/Guides";
import { HeroPattern } from "@/components/HeroPattern";
import { Libraries } from "@/components/Libraries";
import {
  a,
  Col,
  h2,
  Note,
  Properties,
  Property,
  Row,
  wrapper,
} from "@/components/mdx";
import { Resources } from "@/components/Resources";

const components = {
  a,
  h2,
  wrapper,
  Button,
  code: CodeComponent,
  CodeGroup,
  pre,
  Note,
  Row,
  Col,
  Properties,
  Property,
  Guides,
  HeroPattern,
  Libraries,
  Resources,
};

export function MdxContent({ code }: { code: string }) {
  return <MDXContent code={code} components={components} />;
}
