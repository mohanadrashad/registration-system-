import { ClassicTemplate } from "./classic-template";
import type {
  RegistrationTemplateComponent,
  RegistrationTemplateName,
} from "./types";

// The curated component-per-template registry (spec §2). A finite, hand-built
// set of renderers selected per event by the `Event.template` enum. NOT a
// config-driven page builder — each entry is its own component tree free to
// differ structurally, all sharing one field/data engine underneath (§3).
//
// Stage 1: CLASSIC only (the extracted current renderer). New event identities
// add an enum value + a component here.
export const TEMPLATE_REGISTRY: Record<
  RegistrationTemplateName,
  RegistrationTemplateComponent
> = {
  CLASSIC: ClassicTemplate,
};

// Always resolves to a template: an unknown / future value (e.g. a DB row
// ahead of the deploy) falls back to CLASSIC rather than rendering nothing.
export function resolveTemplate(
  name: string | null | undefined
): RegistrationTemplateComponent {
  return (
    TEMPLATE_REGISTRY[name as RegistrationTemplateName] ?? ClassicTemplate
  );
}
