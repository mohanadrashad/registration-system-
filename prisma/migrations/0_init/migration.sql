-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('VIEWER', 'EDITOR', 'MANAGER', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "EmailProvider" AS ENUM ('SYSTEM', 'CUSTOM_SMTP', 'RESEND', 'SENDGRID', 'MAILGUN');

-- CreateEnum
CREATE TYPE "WhatsAppProvider" AS ENUM ('META', 'TWILIO', 'WATI');

-- CreateEnum
CREATE TYPE "WhatsAppStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('IMPORTED', 'INVITED', 'REGISTERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'PENDING_APPROVAL', 'CONFIRMED', 'CANCELLED', 'WAITLISTED');

-- CreateEnum
CREATE TYPE "CheckInMethod" AS ENUM ('QR_SCAN', 'MANUAL', 'SELF_SERVICE', 'BULK');

-- CreateEnum
CREATE TYPE "EmailTemplateType" AS ENUM ('INVITATION', 'REMINDER', 'CONFIRMATION', 'ANNOUNCEMENT', 'BADGE_DELIVERY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "EmailCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailLogStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'BOUNCED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "FieldMapping" AS ENUM ('FIRST_NAME', 'LAST_NAME', 'FULL_NAME', 'EMAIL', 'PHONE', 'ORGANIZATION', 'DESIGNATION');

-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('TEXT', 'EMAIL', 'PHONE', 'TEXTAREA', 'NUMBER', 'SELECT', 'MULTISELECT', 'RADIO', 'CHECKBOX', 'DATE', 'TIME', 'DATETIME', 'COUNTRY', 'PHONE_COUNTRY', 'FILE', 'HIDDEN', 'HEADING', 'DIVIDER', 'PARAGRAPH');

-- CreateEnum
CREATE TYPE "FieldWidth" AS ENUM ('FULL', 'HALF', 'THIRD');

-- CreateEnum
CREATE TYPE "OptionColumns" AS ENUM ('AUTO', 'ONE', 'TWO');

-- CreateEnum
CREATE TYPE "RegistrationTemplate" AS ENUM ('CLASSIC');

-- CreateEnum
CREATE TYPE "PhaseType" AS ENUM ('REGISTRATION', 'POST_REGISTRATION');

-- CreateEnum
CREATE TYPE "PhaseSelectionMode" AS ENUM ('NONE', 'ADMIN_ASSIGNED', 'ATTENDEE_PICKS', 'MIXED', 'EXTERNAL_BOOKING');

-- CreateEnum
CREATE TYPE "AccessStatus" AS ENUM ('LOCKED', 'OPEN');

-- CreateEnum
CREATE TYPE "SelectionSource" AS ENUM ('ADMIN_ASSIGNED', 'ATTENDEE_PICKED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "password" TEXT NOT NULL,
    "image" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "venue" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "capacity" INTEGER,
    "settings" JSONB,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "template" "RegistrationTemplate" NOT NULL DEFAULT 'CLASSIC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendeeGroup" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "allowMultiple" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendeeGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendeeGroupValue" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendeeGroupValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactGroupAssignment" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "valueId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "ContactGroupAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventModules" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "formBuilder" BOOLEAN NOT NULL DEFAULT true,
    "checkIn" BOOLEAN NOT NULL DEFAULT false,
    "whatsApp" BOOLEAN NOT NULL DEFAULT false,
    "sessions" BOOLEAN NOT NULL DEFAULT false,
    "payments" BOOLEAN NOT NULL DEFAULT false,
    "selfServicePortal" BOOLEAN NOT NULL DEFAULT false,
    "approvalWorkflow" BOOLEAN NOT NULL DEFAULT false,
    "waitlist" BOOLEAN NOT NULL DEFAULT false,
    "multiLanguage" BOOLEAN NOT NULL DEFAULT false,
    "customDomain" BOOLEAN NOT NULL DEFAULT false,
    "customEmail" BOOLEAN NOT NULL DEFAULT false,
    "webhooks" BOOLEAN NOT NULL DEFAULT false,
    "postRegPhases" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventModules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventEmailSettings" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "provider" "EmailProvider" NOT NULL DEFAULT 'SYSTEM',
    "fromName" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "replyTo" TEXT,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpUser" TEXT,
    "smtpPassword" TEXT,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
    "apiKey" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventEmailSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventWhatsAppSettings" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "provider" "WhatsAppProvider" NOT NULL DEFAULT 'META',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "phoneNumberId" TEXT,
    "businessAccountId" TEXT,
    "accessToken" TEXT,
    "webhookVerifyToken" TEXT,
    "confirmationTemplate" TEXT,
    "reminderTemplate" TEXT,
    "badgeTemplate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventWhatsAppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppLog" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "status" "WhatsAppStatus" NOT NULL DEFAULT 'PENDING',
    "messageId" TEXT,
    "variables" JSONB,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventBranding" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "primaryColor" TEXT NOT NULL DEFAULT '#7dc242',
    "secondaryColor" TEXT,
    "backgroundColor" TEXT,
    "textColor" TEXT,
    "logoUrl" TEXT,
    "logoWhiteUrl" TEXT,
    "faviconUrl" TEXT,
    "headerImageUrl" TEXT,
    "headerColor" TEXT,
    "headerShowLogo" BOOLEAN NOT NULL DEFAULT true,
    "logoHeight" INTEGER,
    "customCss" TEXT,
    "welcomeTitle" TEXT,
    "welcomeTitleAr" TEXT,
    "welcomeMessage" TEXT,
    "welcomeMessageAr" TEXT,
    "footerText" TEXT,
    "footerTextAr" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventBranding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventDomain" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "customDomain" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "verificationRecord" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "organization" TEXT,
    "designation" TEXT,
    "category" TEXT,
    "status" "ContactStatus" NOT NULL DEFAULT 'IMPORTED',
    "serialNumber" INTEGER,
    "inviteToken" TEXT,
    "metadata" JSONB,
    "importBatch" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Registration" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "registeredAt" TIMESTAMP(3),
    "confirmationCode" TEXT NOT NULL,
    "formData" JSONB,
    "badgeGenerated" BOOLEAN NOT NULL DEFAULT false,
    "badgeEmailSent" BOOLEAN NOT NULL DEFAULT false,
    "badgeUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,

    CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "checkInTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkOutTime" TIMESTAMP(3),
    "method" "CheckInMethod" NOT NULL,
    "location" TEXT,
    "checkInPointId" TEXT,
    "deviceId" TEXT,
    "checkedInBy" TEXT,
    "notes" TEXT,
    "metadata" JSONB,

    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckInPoint" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckInPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "EmailTemplateType" NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "bodyJson" JSONB,
    "headerHtml" TEXT,
    "footerHtml" TEXT,
    "variables" TEXT[],
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailCampaign" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "EmailCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "recipientFilter" JSONB,
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "contactId" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "EmailLogStatus" NOT NULL DEFAULT 'QUEUED',
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "resendId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BadgeTemplate" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designJson" JSONB NOT NULL,
    "width" INTEGER NOT NULL DEFAULT 400,
    "height" INTEGER NOT NULL DEFAULT 600,
    "backgroundUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BadgeTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Badge" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "pdfUrl" TEXT,
    "imageUrl" TEXT,
    "qrCodeData" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormField" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "labelAr" TEXT,
    "type" "FieldType" NOT NULL,
    "placeholder" TEXT,
    "placeholderAr" TEXT,
    "helpText" TEXT,
    "helpTextAr" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "validation" JSONB,
    "options" JSONB,
    "order" INTEGER NOT NULL DEFAULT 0,
    "width" "FieldWidth" NOT NULL DEFAULT 'FULL',
    "optionColumns" "OptionColumns" NOT NULL DEFAULT 'AUTO',
    "section" TEXT,
    "conditional" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "defaultValue" TEXT,
    "metadata" JSONB,
    "mapsTo" "FieldMapping",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Phase" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" "PhaseType" NOT NULL,
    "title" TEXT NOT NULL,
    "titleAr" TEXT,
    "description" TEXT,
    "descriptionAr" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "reminderSent" BOOLEAN NOT NULL DEFAULT false,
    "reminderTemplateId" TEXT,
    "appliesToCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "selectionMode" "PhaseSelectionMode" NOT NULL DEFAULT 'NONE',
    "maxSelections" INTEGER NOT NULL DEFAULT 1,
    "allowChangeAfterSubmit" BOOLEAN NOT NULL DEFAULT false,
    "requiresReceiptUpload" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Phase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Step" (
    "id" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleAr" TEXT,
    "description" TEXT,
    "descriptionAr" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhaseSubmission" (
    "id" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhaseSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhaseAccess" (
    "id" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "status" "AccessStatus" NOT NULL,
    "unlockedAt" TIMESTAMP(3),
    "unlockedBy" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhaseAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalOtp" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalOtp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhaseOption" (
    "id" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "labelAr" TEXT,
    "description" TEXT,
    "descriptionAr" TEXT,
    "externalUrl" TEXT,
    "capacity" INTEGER,
    "metadata" JSONB,
    "requiresReceipt" BOOLEAN,
    "receiptLabel" TEXT,
    "receiptInstructions" TEXT,
    "receiptLabelAr" TEXT,
    "receiptInstructionsAr" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhaseOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendeeSelection" (
    "id" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "source" "SelectionSource" NOT NULL,
    "assignedBy" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "receiptFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendeeSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhaseReceipt" (
    "id" TEXT NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "blobPath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "originalName" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedBy" TEXT NOT NULL,

    CONSTRAINT "PhaseReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrationFile" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT,
    "formFieldId" TEXT NOT NULL,
    "uploadSessionId" TEXT NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "blobPath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "originalName" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedBy" TEXT NOT NULL,

    CONSTRAINT "RegistrationFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");

-- CreateIndex
CREATE INDEX "EventMember_eventId_idx" ON "EventMember"("eventId");

-- CreateIndex
CREATE INDEX "EventMember_userId_idx" ON "EventMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EventMember_userId_eventId_key" ON "EventMember"("userId", "eventId");

-- CreateIndex
CREATE INDEX "AttendeeGroup_eventId_idx" ON "AttendeeGroup"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendeeGroup_eventId_name_key" ON "AttendeeGroup"("eventId", "name");

-- CreateIndex
CREATE INDEX "AttendeeGroupValue_groupId_idx" ON "AttendeeGroupValue"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendeeGroupValue_groupId_label_key" ON "AttendeeGroupValue"("groupId", "label");

-- CreateIndex
CREATE INDEX "ContactGroupAssignment_contactId_idx" ON "ContactGroupAssignment"("contactId");

-- CreateIndex
CREATE INDEX "ContactGroupAssignment_groupId_idx" ON "ContactGroupAssignment"("groupId");

-- CreateIndex
CREATE INDEX "ContactGroupAssignment_valueId_idx" ON "ContactGroupAssignment"("valueId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactGroupAssignment_contactId_valueId_key" ON "ContactGroupAssignment"("contactId", "valueId");

-- CreateIndex
CREATE UNIQUE INDEX "EventModules_eventId_key" ON "EventModules"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventEmailSettings_eventId_key" ON "EventEmailSettings"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventWhatsAppSettings_eventId_key" ON "EventWhatsAppSettings"("eventId");

-- CreateIndex
CREATE INDEX "WhatsAppLog_eventId_idx" ON "WhatsAppLog"("eventId");

-- CreateIndex
CREATE INDEX "WhatsAppLog_contactId_idx" ON "WhatsAppLog"("contactId");

-- CreateIndex
CREATE INDEX "WhatsAppLog_status_idx" ON "WhatsAppLog"("status");

-- CreateIndex
CREATE UNIQUE INDEX "EventBranding_eventId_key" ON "EventBranding"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventDomain_eventId_key" ON "EventDomain"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventDomain_customDomain_key" ON "EventDomain"("customDomain");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_inviteToken_key" ON "Contact"("inviteToken");

-- CreateIndex
CREATE INDEX "Contact_eventId_idx" ON "Contact"("eventId");

-- CreateIndex
CREATE INDEX "Contact_eventId_status_idx" ON "Contact"("eventId", "status");

-- CreateIndex
CREATE INDEX "Contact_email_idx" ON "Contact"("email");

-- CreateIndex
CREATE INDEX "Contact_updatedBy_idx" ON "Contact"("updatedBy");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_eventId_email_key" ON "Contact"("eventId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_eventId_serialNumber_key" ON "Contact"("eventId", "serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_contactId_key" ON "Registration"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_confirmationCode_key" ON "Registration"("confirmationCode");

-- CreateIndex
CREATE INDEX "Registration_eventId_idx" ON "Registration"("eventId");

-- CreateIndex
CREATE INDEX "Registration_status_idx" ON "Registration"("status");

-- CreateIndex
CREATE INDEX "Registration_updatedBy_idx" ON "Registration"("updatedBy");

-- CreateIndex
CREATE INDEX "Registration_approvedBy_idx" ON "Registration"("approvedBy");

-- CreateIndex
CREATE INDEX "CheckIn_registrationId_idx" ON "CheckIn"("registrationId");

-- CreateIndex
CREATE INDEX "CheckIn_eventId_checkInTime_idx" ON "CheckIn"("eventId", "checkInTime");

-- CreateIndex
CREATE INDEX "CheckIn_eventId_idx" ON "CheckIn"("eventId");

-- CreateIndex
CREATE INDEX "CheckInPoint_eventId_idx" ON "CheckInPoint"("eventId");

-- CreateIndex
CREATE INDEX "EmailTemplate_eventId_idx" ON "EmailTemplate"("eventId");

-- CreateIndex
CREATE INDEX "EmailCampaign_eventId_idx" ON "EmailCampaign"("eventId");

-- CreateIndex
CREATE INDEX "EmailCampaign_status_idx" ON "EmailCampaign"("status");

-- CreateIndex
CREATE INDEX "EmailLog_campaignId_idx" ON "EmailLog"("campaignId");

-- CreateIndex
CREATE INDEX "EmailLog_contactId_idx" ON "EmailLog"("contactId");

-- CreateIndex
CREATE INDEX "EmailLog_status_idx" ON "EmailLog"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BadgeTemplate_eventId_key" ON "BadgeTemplate"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Badge_registrationId_key" ON "Badge"("registrationId");

-- CreateIndex
CREATE INDEX "FormField_eventId_order_idx" ON "FormField"("eventId", "order");

-- CreateIndex
CREATE INDEX "FormField_eventId_isActive_idx" ON "FormField"("eventId", "isActive");

-- CreateIndex
CREATE INDEX "FormField_stepId_order_idx" ON "FormField"("stepId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "FormField_eventId_name_key" ON "FormField"("eventId", "name");

-- CreateIndex
CREATE INDEX "Phase_eventId_type_idx" ON "Phase"("eventId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Phase_eventId_order_key" ON "Phase"("eventId", "order");

-- CreateIndex
CREATE INDEX "Step_phaseId_idx" ON "Step"("phaseId");

-- CreateIndex
CREATE UNIQUE INDEX "Step_phaseId_order_key" ON "Step"("phaseId", "order");

-- CreateIndex
CREATE INDEX "PhaseSubmission_registrationId_idx" ON "PhaseSubmission"("registrationId");

-- CreateIndex
CREATE INDEX "PhaseSubmission_phaseId_idx" ON "PhaseSubmission"("phaseId");

-- CreateIndex
CREATE UNIQUE INDEX "PhaseSubmission_phaseId_registrationId_key" ON "PhaseSubmission"("phaseId", "registrationId");

-- CreateIndex
CREATE INDEX "PhaseAccess_registrationId_idx" ON "PhaseAccess"("registrationId");

-- CreateIndex
CREATE UNIQUE INDEX "PhaseAccess_phaseId_registrationId_key" ON "PhaseAccess"("phaseId", "registrationId");

-- CreateIndex
CREATE INDEX "PortalOtp_registrationId_idx" ON "PortalOtp"("registrationId");

-- CreateIndex
CREATE INDEX "PortalOtp_expiresAt_idx" ON "PortalOtp"("expiresAt");

-- CreateIndex
CREATE INDEX "PhaseOption_phaseId_isActive_idx" ON "PhaseOption"("phaseId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PhaseOption_phaseId_order_key" ON "PhaseOption"("phaseId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "AttendeeSelection_receiptFileId_key" ON "AttendeeSelection"("receiptFileId");

-- CreateIndex
CREATE INDEX "AttendeeSelection_phaseId_optionId_idx" ON "AttendeeSelection"("phaseId", "optionId");

-- CreateIndex
CREATE INDEX "AttendeeSelection_registrationId_idx" ON "AttendeeSelection"("registrationId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendeeSelection_phaseId_registrationId_optionId_key" ON "AttendeeSelection"("phaseId", "registrationId", "optionId");

-- CreateIndex
CREATE UNIQUE INDEX "PhaseReceipt_blobPath_key" ON "PhaseReceipt"("blobPath");

-- CreateIndex
CREATE INDEX "PhaseReceipt_uploadedAt_idx" ON "PhaseReceipt"("uploadedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationFile_blobPath_key" ON "RegistrationFile"("blobPath");

-- CreateIndex
CREATE INDEX "RegistrationFile_uploadSessionId_idx" ON "RegistrationFile"("uploadSessionId");

-- CreateIndex
CREATE INDEX "RegistrationFile_registrationId_idx" ON "RegistrationFile"("registrationId");

-- CreateIndex
CREATE INDEX "RegistrationFile_formFieldId_idx" ON "RegistrationFile"("formFieldId");

-- CreateIndex
CREATE INDEX "RegistrationFile_uploadedAt_idx" ON "RegistrationFile"("uploadedAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventMember" ADD CONSTRAINT "EventMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventMember" ADD CONSTRAINT "EventMember_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendeeGroup" ADD CONSTRAINT "AttendeeGroup_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendeeGroupValue" ADD CONSTRAINT "AttendeeGroupValue_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AttendeeGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactGroupAssignment" ADD CONSTRAINT "ContactGroupAssignment_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactGroupAssignment" ADD CONSTRAINT "ContactGroupAssignment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AttendeeGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactGroupAssignment" ADD CONSTRAINT "ContactGroupAssignment_valueId_fkey" FOREIGN KEY ("valueId") REFERENCES "AttendeeGroupValue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactGroupAssignment" ADD CONSTRAINT "ContactGroupAssignment_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventModules" ADD CONSTRAINT "EventModules_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventEmailSettings" ADD CONSTRAINT "EventEmailSettings_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventWhatsAppSettings" ADD CONSTRAINT "EventWhatsAppSettings_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppLog" ADD CONSTRAINT "WhatsAppLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppLog" ADD CONSTRAINT "WhatsAppLog_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventBranding" ADD CONSTRAINT "EventBranding_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventDomain" ADD CONSTRAINT "EventDomain_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_rejectedBy_fkey" FOREIGN KEY ("rejectedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInPoint" ADD CONSTRAINT "CheckInPoint_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailCampaign" ADD CONSTRAINT "EmailCampaign_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailCampaign" ADD CONSTRAINT "EmailCampaign_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EmailTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BadgeTemplate" ADD CONSTRAINT "BadgeTemplate_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Badge" ADD CONSTRAINT "Badge_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Badge" ADD CONSTRAINT "Badge_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "BadgeTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormField" ADD CONSTRAINT "FormField_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormField" ADD CONSTRAINT "FormField_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "Step"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Phase" ADD CONSTRAINT "Phase_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Phase" ADD CONSTRAINT "Phase_reminderTemplateId_fkey" FOREIGN KEY ("reminderTemplateId") REFERENCES "EmailTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Step" ADD CONSTRAINT "Step_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhaseSubmission" ADD CONSTRAINT "PhaseSubmission_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhaseSubmission" ADD CONSTRAINT "PhaseSubmission_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhaseAccess" ADD CONSTRAINT "PhaseAccess_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhaseAccess" ADD CONSTRAINT "PhaseAccess_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalOtp" ADD CONSTRAINT "PortalOtp_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhaseOption" ADD CONSTRAINT "PhaseOption_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendeeSelection" ADD CONSTRAINT "AttendeeSelection_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendeeSelection" ADD CONSTRAINT "AttendeeSelection_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendeeSelection" ADD CONSTRAINT "AttendeeSelection_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "PhaseOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendeeSelection" ADD CONSTRAINT "AttendeeSelection_receiptFileId_fkey" FOREIGN KEY ("receiptFileId") REFERENCES "PhaseReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationFile" ADD CONSTRAINT "RegistrationFile_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationFile" ADD CONSTRAINT "RegistrationFile_formFieldId_fkey" FOREIGN KEY ("formFieldId") REFERENCES "FormField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

