import WeatherDashboard from "@/components/hourly/WeatherDashboard";
import MorningForecast from "@/components/morning/MorningForecast";
import MarineBulletin from "@/components/marine/MarineBulletin";
import EveningForecast from "@/components/evening/EveningForecast";
import MiddayReport from "@/components/midday/MiddayReport";
import AbsenteeReport from "@/components/absentee/AbsenteeReport";
import LeaveOfAbsenceApplication from "@/components/leave/LeaveOfAbsenceApplication";
import DailyAirportStatusReport from "@/components/status/DailyAirportStatusReport";
import ShiftExchangeRequisitionForm from "@/components/shift/ShiftExchangeRequisitionForm";
import OfficialTimeSheet from "@/components/timesheet/OfficialTimeSheet";
import MeteorologicalDutyRoster from "@/components/roster/MeteorologicalDutyRoster";

export default function Home() {
  return (
    <div className=" bg-zinc-50  sm:px-6 sm:py-16  flex flex-col gap-8">
      <div className="mx-auto max-w-lg">
        <WeatherDashboard />
      </div>
      <div className="mx-auto border box-border min-w-[210mm] max-w-[210mm] min-h-[297mm] max-h-[297mm] w-[210mm] h-[297mm] overflow-hidden print:page-break-after-always">
        <MorningForecast />
      </div>

      <div className="mx-auto border box-border min-w-[210mm] max-w-[210mm] min-h-[297mm] max-h-[297mm] w-[210mm] h-[297mm] overflow-hidden print:page-break-after-always">
        <MiddayReport />
      </div>

      <div className="mx-auto border box-border min-w-[210mm] max-w-[210mm] min-h-[297mm] max-h-[297mm] w-[210mm] h-[297mm] overflow-hidden print:page-break-after-always">
        <EveningForecast />
      </div>
      <div className="mx-auto border box-border min-w-[210mm] max-w-[210mm] min-h-[297mm] max-h-[297mm] w-[210mm] h-[297mm] overflow-hidden print:page-break-before-always">
        <MarineBulletin />
      </div>
      <div className="mx-auto border box-border min-w-[210mm] max-w-[210mm] min-h-[297mm] max-h-[297mm] w-[210mm] h-[297mm] overflow-hidden print:page-break-before-always">
        <AbsenteeReport />
      </div>
      <div className="mx-auto border box-border min-w-[210mm] max-w-[210mm] min-h-[297mm] max-h-[297mm] w-[210mm] h-[297mm] overflow-hidden print:page-break-before-always">
        <LeaveOfAbsenceApplication />
      </div>
      <div className="mx-auto border box-border min-w-[210mm] max-w-[210mm] min-h-[297mm] max-h-[297mm] w-[210mm] h-[297mm] overflow-hidden print:page-break-before-always">
        <DailyAirportStatusReport />
      </div>
      <div className="mx-auto border box-border min-w-[210mm] max-w-[210mm] min-h-[297mm] max-h-[297mm] w-[210mm] h-[297mm] overflow-hidden print:page-break-before-always">
        <ShiftExchangeRequisitionForm />
      </div>
      <div className="">
        <OfficialTimeSheet />
      </div>
      <div className="">
        <MeteorologicalDutyRoster />
      </div>
    </div>
  );
}
