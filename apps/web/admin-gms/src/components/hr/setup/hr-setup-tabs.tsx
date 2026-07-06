"use client";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@grenmet/ui/components/ui/tabs";
import { DepartmentsManager } from "./departments-manager";
import { ShiftTypesManager } from "./shift-types-manager";

export function HrSetupTabs() {
  return (
    <Tabs defaultValue="shifts">
      <TabsList>
        <TabsTrigger value="shifts">Shift types</TabsTrigger>
        <TabsTrigger value="departments">Departments</TabsTrigger>
      </TabsList>
      <TabsContent value="shifts">
        <ShiftTypesManager />
      </TabsContent>
      <TabsContent value="departments">
        <DepartmentsManager />
      </TabsContent>
    </Tabs>
  );
}
