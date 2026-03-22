import type { MDXComponents } from "mdx/types";
import { Button } from "@/components/Button";
import { CodeGroup, Code as code, Pre as pre } from "@/components/Code";
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

export function useMDXComponents(components: MDXComponents) {
  return {
    ...components,
    a,
    Button,
    code,
    CodeGroup,
    pre,
    wrapper,
    h2,
    Note,
    Row,
    Col,
    Properties,
    Property,
  };
}
