"use client";

import { Button } from "@grenmet/ui/components/ui/button";
import { Card, CardContent } from "@grenmet/ui/components/ui/card";
import { Input } from "@grenmet/ui/components/ui/input";
import { Label } from "@grenmet/ui/components/ui/label";
import { useForm } from "@tanstack/react-form";
import { Printer, RotateCcw } from "lucide-react";
import { EMPTY_LEAVE, LEAVE_TYPES, LeaveDocument } from "./leave-document";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function LeaveApplicationEditor() {
  const form = useForm({ defaultValues: EMPTY_LEAVE });

  return (
    <form.Subscribe selector={(s) => s.values}>
      {(values) => (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-lg">Leave Application</h2>
                <div className="flex gap-2">
                  <Button
                    onClick={() => form.reset()}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <RotateCcw className="size-3.5" />
                    Reset
                  </Button>
                  <Button
                    onClick={() => window.print()}
                    size="sm"
                    type="button"
                  >
                    <Printer className="size-3.5" />
                    Print
                  </Button>
                </div>
              </div>

              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  form.handleSubmit();
                }}
              >
                <form.Field name="employeeName">
                  {(field) => (
                    <div className="space-y-1.5">
                      <Label htmlFor={field.name}>Employee Name</Label>
                      <Input
                        id={field.name}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        value={field.state.value}
                      />
                    </div>
                  )}
                </form.Field>

                <form.Field name="department">
                  {(field) => (
                    <div className="space-y-1.5">
                      <Label htmlFor={field.name}>Department</Label>
                      <Input
                        id={field.name}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        value={field.state.value}
                      />
                    </div>
                  )}
                </form.Field>

                <div className="grid grid-cols-2 gap-4">
                  <form.Field name="daysRequested">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label htmlFor={field.name}>Days Requested</Label>
                        <Input
                          id={field.name}
                          onChange={(e) => field.handleChange(e.target.value)}
                          value={field.state.value}
                        />
                      </div>
                    )}
                  </form.Field>
                  <form.Field name="leaveType">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label htmlFor={field.name}>Type of Leave</Label>
                        <select
                          className={selectClass}
                          id={field.name}
                          onChange={(e) => field.handleChange(e.target.value)}
                          value={field.state.value}
                        >
                          {LEAVE_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </form.Field>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <form.Field name="startDate">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label htmlFor={field.name}>Start Date</Label>
                        <Input
                          id={field.name}
                          onChange={(e) => field.handleChange(e.target.value)}
                          type="date"
                          value={field.state.value}
                        />
                      </div>
                    )}
                  </form.Field>
                  <form.Field name="endDate">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label htmlFor={field.name}>End Date</Label>
                        <Input
                          id={field.name}
                          onChange={(e) => field.handleChange(e.target.value)}
                          type="date"
                          value={field.state.value}
                        />
                      </div>
                    )}
                  </form.Field>
                </div>

                {values.leaveType === "Other" && (
                  <form.Field name="otherReason">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label htmlFor={field.name}>
                          Other — please state reason
                        </Label>
                        <Input
                          id={field.name}
                          onChange={(e) => field.handleChange(e.target.value)}
                          value={field.state.value}
                        />
                      </div>
                    )}
                  </form.Field>
                )}
              </form>
            </CardContent>
          </Card>

          <LeaveDocument values={values} />
        </div>
      )}
    </form.Subscribe>
  );
}
