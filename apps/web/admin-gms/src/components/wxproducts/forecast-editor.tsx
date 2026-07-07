"use client";

import { Field, FieldLabel } from "@grenmet/ui/components/ui/field";
import { Input } from "@grenmet/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@grenmet/ui/components/ui/select";
import { Textarea } from "@grenmet/ui/components/ui/textarea";
import { cn } from "@grenmet/ui/lib/utils";
import { type AnyFieldApi, useForm } from "@tanstack/react-form";
import {
  CloudRain,
  CloudSun,
  Haze,
  type LucideIcon,
  Ship,
  Sun,
  Waves,
  Wind,
} from "lucide-react";
import { DatePicker } from "@/components/document/date-picker";
import { DocumentPreview } from "@/components/document/document-preview";
import { FormActionBar } from "@/components/hr/form-action-bar";
import {
  EMPTY_FORECAST,
  ForecastDocument,
  IBF_HAZARDS,
  IBF_LEVELS,
  type IbfLevel,
  LIKELIHOODS,
  levelTone,
  MARINE_WARNINGS,
  TIDE_RISKS,
  WIND_WARNINGS,
  WX_WARNINGS,
} from "./forecast-document";

const HAZARD_ICON: Record<string, LucideIcon> = {
  rainfall: CloudRain,
  wind: Wind,
  seas: Waves,
  heat: Sun,
  dust: Haze,
};

const LEVEL_DOT: Record<string, string> = {
  Minimal: "bg-gm-warning-green-fg",
  Minor: "bg-gm-warning-yellow-fg",
  Significant: "bg-gm-warning-amber-fg",
  Severe: "bg-gm-warning-red-fg",
};

const RISK_TONE: Record<string, string> = {
  low: "bg-gm-warning-green-bg text-gm-warning-green-fg",
  moderate: "bg-gm-warning-yellow-bg text-gm-warning-yellow-fg",
  high: "bg-gm-warning-amber-bg text-gm-warning-amber-fg",
  extreme: "bg-gm-warning-red-bg text-gm-warning-red-fg",
};

function riskFor(likelihoodIdx: number, impactIdx: number): string {
  const score = likelihoodIdx + impactIdx;
  if (score >= 5) {
    return "extreme";
  }
  if (score >= 4) {
    return "high";
  }
  if (score >= 2) {
    return "moderate";
  }
  return "low";
}

function textInput(field: AnyFieldApi, label: string, textarea = false) {
  const value = (field.state.value ?? "") as string;
  return (
    <Field className="gap-1">
      <FieldLabel className="text-xs" htmlFor={field.name}>
        {label}
      </FieldLabel>
      {textarea ? (
        <Textarea
          id={field.name}
          onChange={(e) => field.handleChange(e.target.value)}
          rows={2}
          value={value}
        />
      ) : (
        <Input
          id={field.name}
          onChange={(e) => field.handleChange(e.target.value)}
          value={value}
        />
      )}
    </Field>
  );
}

function selectInput(
  field: AnyFieldApi,
  label: string,
  options: readonly string[]
) {
  const value = (field.state.value ?? "") as string;
  return (
    <Field className="gap-1">
      <FieldLabel className="text-xs" htmlFor={field.name}>
        {label}
      </FieldLabel>
      <Select onValueChange={(v) => field.handleChange(v ?? "")} value={value}>
        <SelectTrigger id={field.name}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function LevelBadge({ level }: { level: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium text-xs",
        levelTone[level]
      )}
    >
      <span className={cn("size-1.5 rounded-full", LEVEL_DOT[level])} />
      {level} impact
    </span>
  );
}

function Section({
  badge,
  children,
  icon: Icon,
  title,
}: {
  badge?: React.ReactNode;
  children: React.ReactNode;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="size-3.5" />
          </span>
          <h3 className="font-medium text-sm">{title}</h3>
        </div>
        {badge}
      </div>
      {children}
    </div>
  );
}

export function ForecastEditor({ period }: { period: string }) {
  const form = useForm({ defaultValues: EMPTY_FORECAST });

  return (
    <form.Subscribe selector={(s) => s.values}>
      {(values) => {
        const likelihoodIdx = Math.max(
          0,
          LIKELIHOODS.indexOf(values.likelihood as (typeof LIKELIHOODS)[number])
        );
        const impactIdx = Math.max(
          0,
          ...IBF_HAZARDS.map((hz) => IBF_LEVELS.indexOf(values.ibf[hz.id]))
        );

        return (
          <div className="grid items-start gap-5 xl:grid-cols-2">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3">
                <h2 className="font-medium text-lg">{period} Forecast</h2>
                <FormActionBar
                  onDownloadPdf={() => window.print()}
                  onReset={() => form.reset()}
                />
              </div>

              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  form.handleSubmit();
                }}
              >
                {/* Issue details */}
                <Section icon={CloudSun} title="Issue details">
                  <div className="grid grid-cols-2 gap-3">
                    <form.Field name="dateIssued">
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
                    <form.Field name="issueTime">
                      {(field) => textInput(field, "Issue time")}
                    </form.Field>
                    <form.Field name="validity">
                      {(field) => textInput(field, "Validity")}
                    </form.Field>
                    <form.Field name="forecasterName">
                      {(field) => textInput(field, "Forecaster on duty")}
                    </form.Field>
                  </div>
                </Section>

                {/* IBF hazard icons */}
                <Section icon={Haze} title="IBF hazard icons">
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
                    {IBF_HAZARDS.map((hz) => {
                      const Icon = HAZARD_ICON[hz.id];
                      return (
                        <form.Field key={hz.id} name={`ibf.${hz.id}`}>
                          {(field) => {
                            const level = (field.state.value ??
                              "Minimal") as string;
                            return (
                              <div className="flex flex-col gap-1.5 rounded-lg border p-2.5">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="flex items-center gap-1.5 font-medium text-xs">
                                    <Icon className="size-3.5 text-muted-foreground" />
                                    {hz.label}
                                  </span>
                                  <span
                                    className={cn(
                                      "size-2 rounded-full",
                                      LEVEL_DOT[level]
                                    )}
                                  />
                                </div>
                                <Select
                                  onValueChange={(v) =>
                                    field.handleChange(
                                      (v ?? "Minimal") as IbfLevel
                                    )
                                  }
                                  value={level}
                                >
                                  <SelectTrigger
                                    className="h-8"
                                    id={field.name}
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {IBF_LEVELS.map((l) => (
                                      <SelectItem key={l} value={l}>
                                        {l}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            );
                          }}
                        </form.Field>
                      );
                    })}
                  </div>
                </Section>

                {/* Weather */}
                <Section
                  badge={<LevelBadge level={values.ibf.rainfall} />}
                  icon={CloudSun}
                  title="Weather"
                >
                  <form.Field name="summary">
                    {(field) => textInput(field, "Weather summary", true)}
                  </form.Field>
                  <div className="grid grid-cols-2 gap-3">
                    <form.Field name="wxWarning">
                      {(field) =>
                        selectInput(field, "Weather warning", WX_WARNINGS)
                      }
                    </form.Field>
                    <div className="grid grid-cols-2 gap-3">
                      <form.Field name="maxTemperature">
                        {(field) => textInput(field, "Tmax")}
                      </form.Field>
                      <form.Field name="minTemperature">
                        {(field) => textInput(field, "Tmin")}
                      </form.Field>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <form.Field name="weatherImpact1">
                      {(field) => textInput(field, "Impact 1", true)}
                    </form.Field>
                    <form.Field name="weatherImpact2">
                      {(field) => textInput(field, "Impact 2", true)}
                    </form.Field>
                  </div>
                </Section>

                {/* Winds */}
                <Section
                  badge={<LevelBadge level={values.ibf.wind} />}
                  icon={Wind}
                  title="Winds"
                >
                  <div className="grid grid-cols-3 gap-3">
                    <form.Field name="windDirection">
                      {(field) => textInput(field, "Direction")}
                    </form.Field>
                    <form.Field name="windSpeed">
                      {(field) => textInput(field, "Speed")}
                    </form.Field>
                    <form.Field name="windWarning">
                      {(field) =>
                        selectInput(field, "Wind warning", WIND_WARNINGS)
                      }
                    </form.Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <form.Field name="windImpact1">
                      {(field) => textInput(field, "Impact 1", true)}
                    </form.Field>
                    <form.Field name="windImpact2">
                      {(field) => textInput(field, "Impact 2", true)}
                    </form.Field>
                  </div>
                </Section>

                {/* Seas & Marine */}
                <Section
                  badge={<LevelBadge level={values.ibf.seas} />}
                  icon={Ship}
                  title="Seas & Marine"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <form.Field name="seaState">
                      {(field) => textInput(field, "Sea state")}
                    </form.Field>
                    <form.Field name="marineWarning">
                      {(field) =>
                        selectInput(field, "Marine warning", MARINE_WARNINGS)
                      }
                    </form.Field>
                  </div>
                  <form.Field name="marineImpact">
                    {(field) => textInput(field, "Marine impact", true)}
                  </form.Field>
                </Section>

                {/* Tides & Astronomy */}
                <Section icon={Waves} title="Tides & Astronomy">
                  <div className="grid grid-cols-3 gap-3">
                    <form.Field name="highTide">
                      {(field) => textInput(field, "High tide")}
                    </form.Field>
                    <form.Field name="lowTide">
                      {(field) => textInput(field, "Low tide")}
                    </form.Field>
                    <form.Field name="tideRisk">
                      {(field) => selectInput(field, "Tide risk", TIDE_RISKS)}
                    </form.Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <form.Field name="sunrise">
                      {(field) => textInput(field, "Sunrise")}
                    </form.Field>
                    <form.Field name="sunset">
                      {(field) => textInput(field, "Sunset")}
                    </form.Field>
                  </div>
                </Section>

                {/* Risk matrix */}
                <Section icon={CloudSun} title="Risk matrix">
                  <form.Field name="likelihood">
                    {(field) =>
                      selectInput(field, "Overall likelihood", LIKELIHOODS)
                    }
                  </form.Field>
                  <div className="grid grid-cols-[auto_repeat(4,1fr)] gap-1 text-center">
                    <div />
                    {IBF_LEVELS.map((l) => (
                      <div
                        className="text-[10px] text-muted-foreground"
                        key={l}
                      >
                        {l}
                      </div>
                    ))}
                    {[3, 2, 1, 0].map((row) => (
                      <div className="contents" key={row}>
                        <div className="flex items-center pr-1 text-[10px] text-muted-foreground">
                          {LIKELIHOODS[row]}
                        </div>
                        {IBF_LEVELS.map((_level, col) => {
                          const here =
                            row === likelihoodIdx && col === impactIdx;
                          return (
                            <div
                              className={cn(
                                "grid aspect-[1.7] place-items-center rounded-md font-semibold text-[10px]",
                                RISK_TONE[riskFor(row, col)],
                                here && "ring-2 ring-foreground ring-offset-1"
                              )}
                              // biome-ignore lint/suspicious/noArrayIndexKey: fixed 4-column matrix, index is the identity
                              key={col}
                            >
                              {here ? "◆" : ""}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Highlighted cell = overall likelihood × highest hazard
                    impact.
                  </p>
                </Section>
              </form>
            </div>

            <DocumentPreview
              showDownloadPdf={false}
              title={`${period} Forecast`}
            >
              <ForecastDocument period={period} values={values} />
            </DocumentPreview>
          </div>
        );
      }}
    </form.Subscribe>
  );
}
