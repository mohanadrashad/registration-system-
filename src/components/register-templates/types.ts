import type { ComponentType } from "react";
import type { RegistrationTemplate } from "@prisma/client";

// Per-Event Template System.
//
// Stage 1a: a template is a self-contained client component that reads the
// eventSlug (useParams) and owns its own data fetch + form state — i.e. the
// extracted ClassicTemplate, unchanged. So the registry maps a
// RegistrationTemplate enum value to a zero-prop component.
//
// Stage 1b will introduce the shared engine: the container will own the single
// data fetch + form state via a hook and pass a typed `RegistrationTemplateProps`
// contract down, and templates will embed a shared <RegistrationFormBody>. At
// that point this becomes ComponentType<RegistrationTemplateProps>. Kept
// deliberately minimal here so Stage 1a is a verbatim, byte-identical move.
export type RegistrationTemplateName = RegistrationTemplate;

export type RegistrationTemplateComponent = ComponentType;
