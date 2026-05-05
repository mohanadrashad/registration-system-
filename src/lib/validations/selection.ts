import { PhaseSelectionMode, PhaseType } from "@prisma/client";

/**
 * v1 invariant: only POST_REGISTRATION phases may carry selectable options.
 * The REGISTRATION phase keeps its current "fields only" shape — its
 * `selectionMode` must stay `NONE`. The form-builder UI hides the Options
 * panel on REGISTRATION phases and the API enforces this on every PATCH.
 */
export function assertSelectionModeAllowed(
  phaseType: PhaseType,
  selectionMode: PhaseSelectionMode | null | undefined
): void {
  if (
    selectionMode &&
    selectionMode !== PhaseSelectionMode.NONE &&
    phaseType === PhaseType.REGISTRATION
  ) {
    throw new SelectionModeNotAllowedError();
  }
}

export class SelectionModeNotAllowedError extends Error {
  readonly code = "SELECTION_MODE_NOT_ALLOWED_ON_REGISTRATION_PHASE";
  constructor() {
    super(
      "Selectable options are only available on post-registration phases. " +
        "The REGISTRATION phase must keep selectionMode = NONE."
    );
  }
}
