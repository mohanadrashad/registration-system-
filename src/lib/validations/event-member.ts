import { z } from "zod";

const eventRole = z.enum(["VIEWER", "EDITOR", "MANAGER"]);

export const eventMemberAssignmentsSchema = z.object({
  assignments: z.array(
    z.object({
      eventId: z.string().min(1),
      role: eventRole,
    })
  ),
});

export const eventMemberUpsertSchema = z.object({
  email: z.string().email(),
  role: eventRole,
});

export const eventMemberRoleSchema = z.object({
  role: eventRole,
});

export type EventMemberAssignmentsInput = z.infer<
  typeof eventMemberAssignmentsSchema
>;
export type EventMemberUpsertInput = z.infer<typeof eventMemberUpsertSchema>;
export type EventMemberRoleInput = z.infer<typeof eventMemberRoleSchema>;
