import { z } from "zod";

export const createEmailTemplateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["INVITATION", "REMINDER", "CONFIRMATION", "ANNOUNCEMENT", "BADGE_DELIVERY", "CUSTOM"]),
  subject: z.string().min(1, "Subject is required"),
  bodyHtml: z.string().min(1, "Body is required"),
  bodyJson: z.any().optional(),
  headerHtml: z.string().optional(),
  footerHtml: z.string().optional(),
  variables: z.array(z.string()).optional(),
});

export const createEmailCampaignSchema = z.object({
  name: z.string().min(1, "Name is required"),
  templateId: z.string().min(1, "Template is required"),
  recipientFilter: z.object({
    category: z.string().optional(),
    registrationStatus: z.string().optional(),
    all: z.boolean().optional(),
  }).optional(),
  scheduledAt: z.string().optional(),
});

export type CreateEmailTemplateInput = z.infer<typeof createEmailTemplateSchema>;
export type CreateEmailCampaignInput = z.infer<typeof createEmailCampaignSchema>;
