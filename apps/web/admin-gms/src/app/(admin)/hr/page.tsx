import LeaveOfAbsenceApplication from "@/components/hr/leave/LeaveOfAbsenceApplication";
import MeteorologicalDutyRoster from "@/components/hr/roster/MeteorologicalDutyRoster";
import ShiftExchangeRequisitionForm from "@/components/hr/shift/ShiftExchangeRequisitionForm";
import DailyAirportStatusReport from "@/components/hr/status/DailyAirportStatusReport";
import OfficialTimeSheet from "@/components/hr/timesheet/OfficialTimeSheet";

export default function HrPage() {
  return (
    <div className="flex flex-col gap-8 bg-zinc-50 sm:px-6 sm:py-16">
      <div className="print:page-break-before-always mx-auto box-border h-[297mm] max-h-[297mm] min-h-[297mm] w-[210mm] min-w-[210mm] max-w-[210mm] overflow-hidden border">
        <LeaveOfAbsenceApplication />
      </div>
      <div className="print:page-break-before-always mx-auto box-border h-[297mm] max-h-[297mm] min-h-[297mm] w-[210mm] min-w-[210mm] max-w-[210mm] overflow-hidden border">
        <DailyAirportStatusReport />
      </div>
      <div className="print:page-break-before-always mx-auto box-border h-[297mm] max-h-[297mm] min-h-[297mm] w-[210mm] min-w-[210mm] max-w-[210mm] overflow-hidden border">
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
