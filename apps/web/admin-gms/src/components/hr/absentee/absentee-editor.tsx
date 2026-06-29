"use client";

import { Button } from "@grenmet/ui/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@grenmet/ui/components/ui/field";
import { Input } from "@grenmet/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@grenmet/ui/components/ui/select";
import { Separator } from "@grenmet/ui/components/ui/separator";
import { Textarea } from "@grenmet/ui/components/ui/textarea";
import { useForm } from "@tanstack/react-form";
import { RotateCcw } from "lucide-react";
import { DatePicker } from "@/components/document/date-picker";
import { DocumentPreview } from "@/components/document/document-preview";
import {
  ABSENTEE_REASONS,
  AbsenteeDocument,
  EMPTY_ABSENTEE,
} from "./absentee-document";

export function AbsenteeEditor() {
  const form = useForm({ defaultValues: EMPTY_ABSENTEE });

  return (
    <form.Subscribe selector={(s) => s.values}>
      {(values) => (
        <div className="grid items-start gap-5 xl:grid-cols-2">
          <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-lg">Absentee Report</h2>
              <Button
                onClick={() => form.reset()}
                size="sm"
                type="button"
                variant="outline"
              >
                <RotateCcw data-icon="inline-start" />
                Reset
              </Button>
            </div>

            <Separator />

            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                form.handleSubmit();
              }}
            >
              <FieldGroup>
                <form.Field name="employeeName">
                  {(field) => (
                    <Field className="gap-1">
                      <FieldLabel className="text-xs" htmlFor={field.name}>
                        Employee Name
                      </FieldLabel>
                      <Input
                        id={field.name}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        value={field.state.value}
                      />
                    </Field>
                  )}
                </form.Field>

                <div className="grid gap-5 md:grid-cols-2">
                  <form.Field name="department">
                    {(field) => (
                      <Field className="gap-1">
                        <FieldLabel className="text-xs" htmlFor={field.name}>
                          Department
                        </FieldLabel>
                        <Input
                          id={field.name}
                          onChange={(e) => field.handleChange(e.target.value)}
                          value={field.state.value}
                        />
                      </Field>
                    )}
                  </form.Field>
                  <form.Field name="date">
                    {(field) => (
                      <Field className="gap-1">
                        <FieldLabel className="text-xs" htmlFor={field.name}>
                          Date
                        </FieldLabel>
                        <DatePicker
                          id={field.name}
                          onChange={field.handleChange}
                          value={field.state.value}
                        />
                      </Field>
                    )}
                  </form.Field>
                </div>

                <form.Field name="reason">
                  {(field) => (
                    <Field className="gap-1">
                      <FieldLabel className="text-xs" htmlFor={field.name}>
                        Reason
                      </FieldLabel>
                      <Select
                        onValueChange={(v) => field.handleChange(v ?? "")}
                        value={field.state.value}
                      >
                        <SelectTrigger id={field.name}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ABSENTEE_REASONS.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                </form.Field>

                <form.Field name="notes">
                  {(field) => (
                    <Field className="gap-1">
                      <FieldLabel className="text-xs" htmlFor={field.name}>
                        Reason(s) — details
                      </FieldLabel>
                      <Textarea
                        id={field.name}
                        onChange={(e) => field.handleChange(e.target.value)}
                        rows={4}
                        value={field.state.value}
                      />
                    </Field>
                  )}
                </form.Field>
              </FieldGroup>
            </form>
          </div>

          <DocumentPreview title="Absentee Report">
            <AbsenteeDocument values={values} />
          </DocumentPreview>
        </div>
      )}
    </form.Subscribe>
  );
}
