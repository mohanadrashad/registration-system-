"use client";

import { CheckCircle } from "lucide-react";
import { pickText, type PortalLang } from "@/lib/portal/i18n";
import type { FormStep } from "./types";
import type { PageT } from "./page-strings";

// Multi-step progress indicator: numbered circles joined by connector
// lines, plus the "Step N of M · <title>" caption. Rendered only when the
// phase has more than one step.
export function StepIndicator({
  steps,
  currentStep,
  totalSteps,
  lang,
  t,
}: {
  steps: FormStep[];
  currentStep: number;
  totalSteps: number;
  lang: PortalLang;
  t: PageT;
}) {
  const activeStep = steps[currentStep] ?? null;

  function stepTitle(s: FormStep): string {
    return pickText(lang, s.title, s.titleAr);
  }
  function stepDescription(s: FormStep): string {
    return pickText(lang, s.description, s.descriptionAr);
  }

  return (
    <div className="pt-2">
      <div className="flex items-center gap-2">
        {steps.map((step, idx) => {
          const isActive = idx === currentStep;
          const isComplete = idx < currentStep;
          return (
            <div
              key={step.id}
              className="flex-1 flex items-center gap-2"
            >
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold border transition-colors ${
                  isActive || isComplete
                    ? "bg-primary border-primary text-primary-foreground"
                    : "bg-transparent border-gray-300 text-gray-500"
                }`}
              >
                {isComplete ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  idx + 1
                )}
              </div>
              {idx < steps.length - 1 && (
                <div
                  className={`flex-1 h-px ${
                    isComplete ? "bg-primary" : "bg-gray-200"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-500 mt-2">
        {t.stepLabel(currentStep + 1, totalSteps)} ·{" "}
        <span className="font-medium">
          {activeStep ? stepTitle(activeStep) : ""}
        </span>
      </p>
      {activeStep && stepDescription(activeStep) && (
        <p className="text-xs text-gray-500 mt-1">
          {stepDescription(activeStep)}
        </p>
      )}
    </div>
  );
}
