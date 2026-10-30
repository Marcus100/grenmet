import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ForecastPage from "@/app/forecast/page";
import YourPredictionPage from "@/app/make-your-map/page";

vi.mock("server-only", () => ({}));
vi.mock("@/components/forecast/forecast", () => ({ Forecast: () => null }));
vi.mock("@/components/forecast/replay", () => ({ Replay: () => null }));
vi.mock("@/components/map/level-map", () => ({ LevelMap: () => null }));
vi.mock("@/components/make-your-map/prediction-tool", () => ({
  PredictionTool: () => null,
}));

const CONFIGURATION = /10-constituency DPM configuration/;
const CONFLICT =
  /nine DPM (nominees|constituencies), which differs from this directory/;

describe("scenario scope", () => {
  it.each([ForecastPage, YourPredictionPage])(
    "separates ten provisional selections from nine reported nominees",
    (Page) => {
      render(<Page />);
      expect(screen.getByText(CONFIGURATION)).toBeInTheDocument();
      expect(screen.getByText(CONFLICT)).toBeInTheDocument();
    }
  );
});
