// Sentinel filter value meaning "no value here": Uncategorized (no category),
// not assigned to a group, or a blank form answer. Shared by the category
// tabs, the group/form-answer filters, and buildContactWhere so the same token
// flows from the UI through the URL to the where-builder. Kept in its own
// (server-import-free) module so the client bundle can import it without
// pulling in prisma via attendee-filters.ts. Distinctive enough not to collide
// with a real category or option value.
export const FILTER_NONE_VALUE = "__none__";
