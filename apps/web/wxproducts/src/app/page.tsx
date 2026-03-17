import EveningForecast from "@/components/evening/EveningForecast";
import WeatherDashboard from "@/components/hourly/WeatherDashboard";
import MarineBulletin from "@/components/marine/MarineBulletin";
import MiddayReport from "@/components/midday/MiddayReport";
import MorningForecast from "@/components/morning/MorningForecast";

export default function Home() {
  return (
    <div className="flex flex-col gap-8 bg-zinc-50 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-lg">
        <WeatherDashboard />
      </div>
      <div className="print:page-break-after-always mx-auto box-border w-[210mm] min-w-[210mm] max-w-[210mm] border">
        <MorningForecast />
      </div>

      <div className="print:page-break-after-always mx-auto box-border h-[297mm] max-h-[297mm] min-h-[297mm] w-[210mm] min-w-[210mm] max-w-[210mm] overflow-hidden border">
        <MiddayReport />
      </div>

      <div className="print:page-break-after-always mx-auto box-border h-[297mm] max-h-[297mm] min-h-[297mm] w-[210mm] min-w-[210mm] max-w-[210mm] overflow-hidden border">
        <EveningForecast />
      </div>
      <div className="print:page-break-before-always mx-auto box-border h-[297mm] max-h-[297mm] min-h-[297mm] w-[210mm] min-w-[210mm] max-w-[210mm] overflow-hidden border">
        <MarineBulletin />
      </div>
    </div>
  );
}
