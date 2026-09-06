import EveningFcst from "@/components/wxproducts/eveningfcst";
import Hourly from "@/components/wxproducts/hourly";
import MarineBulletin from "@/components/wxproducts/marinebulletin";
import MiddayFcst from "@/components/wxproducts/middayfcst";
import MorningFcst from "@/components/wxproducts/morningfcst";

export default function Home() {
  return (
    <div className="flex flex-col gap-8 bg-zinc-50 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-lg">
        <Hourly />
      </div>
      <div className="print:page-break-after-always mx-auto box-border h-[297mm] max-h-[297mm] min-h-[297mm] w-[210mm] min-w-[210mm] max-w-[210mm] overflow-hidden border">
        <MorningFcst />
      </div>

      <div className="print:page-break-after-always mx-auto box-border h-[297mm] max-h-[297mm] min-h-[297mm] w-[210mm] min-w-[210mm] max-w-[210mm] overflow-hidden border">
        <MiddayFcst />
      </div>

      <div className="print:page-break-after-always mx-auto box-border h-[297mm] max-h-[297mm] min-h-[297mm] w-[210mm] min-w-[210mm] max-w-[210mm] overflow-hidden border">
        <EveningFcst />
      </div>
      <div className="print:page-break-before-always mx-auto box-border h-[297mm] max-h-[297mm] min-h-[297mm] w-[210mm] min-w-[210mm] max-w-[210mm] overflow-hidden border">
        <MarineBulletin />
      </div>
    </div>
  );
}
