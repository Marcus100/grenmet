"use client";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@barrelsgd/ui/components/ui/tabs";
import { DepartmentsManager } from "./departments-manager";
import { ShiftTypesManager } from "./shift-types-manager";
import { StaffSetupManager } from "./staff-setup";

export function HrSetupTabs() {
  return (
    <Tabs className="w-full flex-col gap-4" defaultValue="shifts">
      <TabsList className="max-w-full shrink-0 justify-start overflow-x-auto">
        <TabsTrigger value="staff">Staff baseline</TabsTrigger>
        <TabsTrigger value="shifts">Shift types</TabsTrigger>
        <TabsTrigger value="departments">Departments</TabsTrigger>
      </TabsList>
      <TabsContent className="w-full min-w-0" value="staff">
        <StaffSetupManager />
      </TabsContent>
      <TabsContent className="w-full min-w-0" value="shifts">
        <ShiftTypesManager />
      </TabsContent>
      <TabsContent className="w-full min-w-0" value="departments">
        <DepartmentsManager />
      </TabsContent>
    </Tabs>
  );
}
