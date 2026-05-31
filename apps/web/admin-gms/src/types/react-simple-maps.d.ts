declare module "react-simple-maps" {
  import type { ReactNode, SVGProps } from "react";

  interface GeographyRecord {
    geometry: unknown;
    properties: Record<string, unknown>;
    rsmKey: string;
    type: string;
  }

  interface GeographiesChildProps {
    borders: unknown;
    geographies: GeographyRecord[];
    outline: unknown;
  }

  interface ComposableMapProps extends SVGProps<SVGSVGElement> {
    height?: number;
    projection?: string;
    projectionConfig?: Record<string, unknown>;
    width?: number;
  }

  interface GeographiesProps {
    children: (props: GeographiesChildProps) => ReactNode;
    geography: string | object;
    parseGeographies?: (features: unknown[]) => unknown[];
  }

  interface GeographyStyleSpec {
    cursor?: string;
    fill?: string;
    outline?: string;
    [key: string]: string | undefined;
  }

  interface GeographyProps extends SVGProps<SVGPathElement> {
    geography: GeographyRecord;
    style?: {
      default?: GeographyStyleSpec;
      hover?: GeographyStyleSpec;
      pressed?: GeographyStyleSpec;
    };
  }

  interface MarkerProps extends SVGProps<SVGGElement> {
    children?: ReactNode;
    coordinates: [number, number];
  }

  export function ComposableMap(props: ComposableMapProps): JSX.Element;
  export function Geographies(props: GeographiesProps): JSX.Element;
  export function Geography(props: GeographyProps): JSX.Element;
  export function Marker(props: MarkerProps): JSX.Element;
}
