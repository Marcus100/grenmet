import { Button } from "@grenmet/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@grenmet/ui/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@grenmet/ui/components/ui/select";
import { Ellipsis, FileDown, FileUp, RefreshCw, Share2 } from "lucide-react";

export function AnalyticsToolbar() {
  return (
    <div className="flex items-center gap-2">
      <Select defaultValue="last-4-weeks">
        <SelectTrigger className="w-34">
          <SelectValue placeholder="Select range" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="last-7-days">Last 7 days</SelectItem>
            <SelectItem value="last-4-weeks">Last 4 weeks</SelectItem>
            <SelectItem value="last-3-months">Last 3 months</SelectItem>
            <SelectItem value="year-to-date">Year to date</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label="More analytics actions"
              size="icon"
              variant="outline"
            />
          }
        >
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Analytics actions</DropdownMenuLabel>
            <DropdownMenuItem>
              <FileDown />
              Export report
            </DropdownMenuItem>
            <DropdownMenuItem>
              <FileUp />
              Import data
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Share2 />
              Share dashboard
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem>
              <RefreshCw />
              Refresh metrics
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
