"use client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@grenmet/ui/components/ui/dropdown-menu";
import Image from "next/image";
import { MoreDotIcon } from "@/icons";
import CountryMap from "./CountryMap";

export default function DemographicCard() {
  return (
    <div className="rounded-2xl border border-border bg-background p-5 sm:p-6">
      <div className="flex justify-between">
        <div>
          <h3 className="font-semibold text-foreground text-lg">
            Customers Demographic
          </h3>
          <p className="mt-1 text-muted-foreground text-theme-sm">
            Number of customer based on country
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger type="button">
            <MoreDotIcon className="text-gray-400 hover:text-gray-700" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-40">
            <DropdownMenuItem>View More</DropdownMenuItem>
            <DropdownMenuItem>Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="my-6 overflow-hidden rounded-2xl border border-gary-200 bg-gray-50 px-4 py-6 sm:px-6">
        <div
          className="mapOne map-btn -mx-4 -my-6 h-[212px] 2xsm:w-[307px] w-[252px] xsm:w-[358px] sm:-mx-6 md:w-[668px] lg:w-[634px] xl:w-[393px] 2xl:w-[554px]"
          id="mapOne"
        >
          <CountryMap />
        </div>
      </div>

      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-full max-w-8 items-center rounded-full">
              <Image
                alt="usa"
                className="w-full"
                height={48}
                src="/images/country/country-01.svg"
                width={48}
              />
            </div>
            <div>
              <p className="font-semibold text-foreground text-theme-sm">USA</p>
              <span className="block text-muted-foreground text-theme-xs">
                2,379 Customers
              </span>
            </div>
          </div>

          <div className="flex w-full max-w-[140px] items-center gap-3">
            <div className="relative block h-2 w-full max-w-[100px] rounded-sm bg-gray-200">
              <div className="absolute top-0 left-0 flex h-full w-[79%] items-center justify-center rounded-sm bg-brand-500 font-medium text-white text-xs" />
            </div>
            <p className="font-medium text-foreground text-theme-sm">79%</p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-full max-w-8 items-center rounded-full">
              <Image
                alt="france"
                className="w-full"
                height={48}
                src="/images/country/country-02.svg"
                width={48}
              />
            </div>
            <div>
              <p className="font-semibold text-foreground text-theme-sm">
                France
              </p>
              <span className="block text-muted-foreground text-theme-xs">
                589 Customers
              </span>
            </div>
          </div>

          <div className="flex w-full max-w-[140px] items-center gap-3">
            <div className="relative block h-2 w-full max-w-[100px] rounded-sm bg-gray-200">
              <div className="absolute top-0 left-0 flex h-full w-[23%] items-center justify-center rounded-sm bg-brand-500 font-medium text-white text-xs" />
            </div>
            <p className="font-medium text-foreground text-theme-sm">23%</p>
          </div>
        </div>
      </div>
    </div>
  );
}
