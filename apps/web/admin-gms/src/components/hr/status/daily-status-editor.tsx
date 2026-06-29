"use client";

import { Button } from "@grenmet/ui/components/ui/button";
import { Card, CardContent } from "@grenmet/ui/components/ui/card";
import { Input } from "@grenmet/ui/components/ui/input";
import { Label } from "@grenmet/ui/components/ui/label";
import { Textarea } from "@grenmet/ui/components/ui/textarea";
import { useForm } from "@tanstack/react-form";
import { Printer, RotateCcw } from "lucide-react";
import {
  DailyStatusDocument,
  EMPTY_DAILY_STATUS,
  SHIFT_OPTIONS,
  YES_NO,
} from "./daily-status-document";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function DailyStatusEditor() {
  const form = useForm({ defaultValues: EMPTY_DAILY_STATUS });

  return (
    <form.Subscribe selector={(s) => s.values}>
      {(values) => (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-lg">
                  Daily Airport Status Report
                </h2>
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
                <div className="grid grid-cols-2 gap-4">
                  <form.Field name="department">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label htmlFor={field.name}>Department</Label>
                        <Input
                          id={field.name}
                          onChange={(e) => field.handleChange(e.target.value)}
                          value={field.state.value}
                        />
                      </div>
                    )}
                  </form.Field>
                  <form.Field name="date">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label htmlFor={field.name}>Date</Label>
                        <Input
                          id={field.name}
                          onChange={(e) => field.handleChange(e.target.value)}
                          type="date"
                          value={field.state.value}
                        />
                      </div>
                    )}
                  </form.Field>
                  <form.Field name="shift">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label htmlFor={field.name}>Shift</Label>
                        <select
                          className={selectClass}
                          id={field.name}
                          onChange={(e) => field.handleChange(e.target.value)}
                          value={field.state.value}
                        >
                          {SHIFT_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </form.Field>
                  <form.Field name="absenteeism">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label htmlFor={field.name}>Absenteeism</Label>
                        <Input
                          id={field.name}
                          onChange={(e) => field.handleChange(e.target.value)}
                          value={field.state.value}
                        />
                      </div>
                    )}
                  </form.Field>
                </div>

                <form.Field name="allReported">
                  {(field) => (
                    <div className="space-y-1.5">
                      <Label htmlFor={field.name}>
                        All persons reported on time?
                      </Label>
                      <select
                        className={selectClass}
                        id={field.name}
                        onChange={(e) => field.handleChange(e.target.value)}
                        value={field.state.value}
                      >
                        {YES_NO.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </form.Field>

                {values.allReported === "No" && (
                  <form.Field name="notReportedExplain">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label htmlFor={field.name}>If No, explain</Label>
                        <Input
                          id={field.name}
                          onChange={(e) => field.handleChange(e.target.value)}
                          value={field.state.value}
                        />
                      </div>
                    )}
                  </form.Field>
                )}

                <form.Field name="affectedEfficiency">
                  {(field) => (
                    <div className="space-y-1.5">
                      <Label htmlFor={field.name}>
                        Affected status / efficiency of operations?
                      </Label>
                      <select
                        className={selectClass}
                        id={field.name}
                        onChange={(e) => field.handleChange(e.target.value)}
                        value={field.state.value}
                      >
                        {YES_NO.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </form.Field>

                {values.affectedEfficiency === "Yes" && (
                  <form.Field name="affectedExplain">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label htmlFor={field.name}>If Yes, explain</Label>
                        <Input
                          id={field.name}
                          onChange={(e) => field.handleChange(e.target.value)}
                          value={field.state.value}
                        />
                      </div>
                    )}
                  </form.Field>
                )}

                <form.Field name="comments">
                  {(field) => (
                    <div className="space-y-1.5">
                      <Label htmlFor={field.name}>
                        Operational status comments
                      </Label>
                      <Textarea
                        id={field.name}
                        onChange={(e) => field.handleChange(e.target.value)}
                        rows={4}
                        value={field.state.value}
                      />
                    </div>
                  )}
                </form.Field>
              </form>
            </CardContent>
          </Card>

          <DailyStatusDocument values={values} />
        </div>
      )}
    </form.Subscribe>
  );
}
