import figma from "@figma/code-connect/react";
import { Button } from "@grenmet/ui/components/ui/button";

figma.connect(
  Button,
  "https://www.figma.com/design/kfVRAcgxzhs4Sj6aCRyOz4/GrenMet-v1?node-id=551-94",
  {
    props: {
      variant: figma.enum("Variant", {
        default: "default",
        destructive: "destructive",
        outline: "outline",
        secondary: "secondary",
        ghost: "ghost",
        link: "link",
      }),
      size: figma.enum("Size", {
        default: "default",
        sm: "sm",
        lg: "lg",
        icon: "icon",
        "icon-sm": "icon-sm",
        "icon-lg": "icon-lg",
      }),
    },
    example: ({ size, variant }) => (
      <Button size={size} variant={variant}>
        Button
      </Button>
    ),
  }
);
