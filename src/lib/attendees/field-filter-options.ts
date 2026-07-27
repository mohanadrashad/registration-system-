import { COUNTRIES } from "@/lib/form-builder/countries";
import { FILTER_NONE_VALUE } from "./filter-constants";

export interface FilterableFieldOption {
  value: string;
  label: string;
  labelAr: string | null;
}

// One entry per option-bearing form field on this event's registration
// form — drives the dynamic "Filters" panel. Comes from the attendees
// API so the filter set always matches the event's actual form.
export interface FilterableField {
  name: string;
  label: string;
  labelAr: string | null;
  type: string;
  options: FilterableFieldOption[];
}

// COUNTRY and CHECKBOX fields arrive with empty options — their choices
// are universal, so they're resolved locally instead of shipped per event.
export function fieldFilterOptions(field: FilterableField): FilterableFieldOption[] {
  // CHECKBOX is always answered (true/false), so a "no answer" option is
  // meaningless — return Yes/No as-is.
  if (field.type === "CHECKBOX") {
    return [
      { value: "true", label: "Yes", labelAr: null },
      { value: "false", label: "No", labelAr: null },
    ];
  }
  const base: FilterableFieldOption[] =
    field.type === "COUNTRY"
      ? COUNTRIES.map((c) => ({ value: c.code, label: c.name, labelAr: c.nameAr }))
      : field.options;
  // Append a "no value" option: ungrouped for a group, blank for a form field.
  const noneLabel = field.type === "GROUP" ? "(None)" : "(No answer)";
  return [
    ...base,
    { value: FILTER_NONE_VALUE, label: noneLabel, labelAr: noneLabel },
  ];
}
