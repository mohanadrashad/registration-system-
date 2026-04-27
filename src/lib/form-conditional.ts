/**
 * Evaluator for `FormField.conditional` — the JSON blob admins set in the
 * form builder to hide a field unless another field has a specific value.
 *
 * Shape (loosely typed because it's free-form JSON in the DB):
 *
 *   { showIf: { field: "needsVisa", operator: "equals", value: true } }
 *
 * Supported operators: equals, notEquals, contains (for arrays/strings).
 * Anything unknown evaluates to "show the field" so admins never accidentally
 * hide content with a typo.
 */

type ShowIfRule = {
  field?: string;
  operator?: string;
  value?: unknown;
};

type ConditionalShape = {
  showIf?: ShowIfRule;
};

export function isFieldVisible(
  conditional: unknown,
  formValues: Record<string, unknown>
): boolean {
  if (!conditional || typeof conditional !== "object") return true;
  const cond = conditional as ConditionalShape;
  const rule = cond.showIf;
  if (!rule || !rule.field || !rule.operator) return true;

  const actual = formValues[rule.field];
  switch (rule.operator) {
    case "equals":
      return actual === rule.value;
    case "notEquals":
      return actual !== rule.value;
    case "contains":
      if (Array.isArray(actual)) return actual.includes(rule.value);
      if (typeof actual === "string" && typeof rule.value === "string") {
        return actual.includes(rule.value);
      }
      return false;
    default:
      return true;
  }
}

/**
 * Server-side companion: a field is required for validation purposes only
 * when it's both `required: true` and visible given the submitted values.
 * Returns true when the field SHOULD be checked.
 */
export function isFieldRequiredByCondition(
  conditional: unknown,
  formValues: Record<string, unknown>
): boolean {
  return isFieldVisible(conditional, formValues);
}
