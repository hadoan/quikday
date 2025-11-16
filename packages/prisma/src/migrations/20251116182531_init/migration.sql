-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'PRO');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('queued', 'planning', 'awaiting_approval', 'awaiting_input', 'scheduled', 'approved', 'pending', 'pending_apps_install', 'running', 'done', 'failed', 'succeeded', 'completed', 'canceled', 'undo_pending', 'undone', 'undo_failed');

-- CreateEnum
CREATE TYPE "AppCategories" AS ENUM ('calendar', 'email', 'messaging', 'other', 'payment', 'web3', 'automation', 'analytics', 'conferencing', 'crm', 'social', 'cloudstorage', 'ai', 'docs', 'data', 'devtools', 'finance');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "sub" TEXT NOT NULL,
    "email" TEXT,
    "displayName" TEXT,
    "avatar" TEXT,
    "timeZone" TEXT DEFAULT 'Europe/Berlin',
    "plan" "Plan" NOT NULL DEFAULT 'PRO',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'PRO',
    "ownerUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" SERIAL NOT NULL,
    "teamId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" SERIAL NOT NULL,
    "teamId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "value" BOOLEAN NOT NULL,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" SERIAL NOT NULL,
    "teamId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "accessTokenCipher" BYTEA,
    "refreshTokenCipher" BYTEA,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "teamId" INTEGER,
    "userId" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL,
    "intent" JSONB,
    "goal" JSONB,
    "plan" JSONB,
    "missing" JSONB,
    "answers" JSONB,
    "config" JSONB,
    "output" JSONB,
    "error" JSONB,
    "scheduledAt" TIMESTAMP(3),
    "toolAllowlist" JSONB,
    "policySnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chat" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "teamId" INTEGER,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatItem" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "role" TEXT,
    "content" JSONB,
    "runId" TEXT,
    "userId" INTEGER,
    "teamId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hideInChat" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ChatItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Step" (
    "id" SERIAL NOT NULL,
    "runId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "appId" TEXT,
    "credentialId" INTEGER,
    "request" JSONB,
    "response" JSONB,
    "errorCode" TEXT,
    "planStepId" TEXT,
    "waitingConfirm" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunScopedKey" (
    "id" SERIAL NOT NULL,
    "runId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "tokenCipher" BYTEA NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RunScopedKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunEffect" (
    "id" SERIAL NOT NULL,
    "runId" TEXT NOT NULL,
    "stepId" INTEGER,
    "appId" TEXT NOT NULL,
    "credentialId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "externalRef" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "undoStrategy" TEXT,
    "canUndo" BOOLEAN NOT NULL DEFAULT false,
    "undoneAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunEffect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LLMLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "teamId" INTEGER,
    "prompt" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "requestType" TEXT NOT NULL,
    "apiEndpoint" TEXT,
    "model" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LLMLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Credential" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "key" JSONB NOT NULL,
    "userId" INTEGER,
    "appId" TEXT NOT NULL,
    "invalid" BOOLEAN NOT NULL DEFAULT false,
    "teamId" INTEGER,
    "isUserCurrentProfile" BOOLEAN NOT NULL DEFAULT false,
    "isTeamDefaultProfile" BOOLEAN NOT NULL DEFAULT false,
    "emailOrUserName" TEXT,
    "avatarUrl" TEXT,
    "name" TEXT,
    "vendorAccountId" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "lastValidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "App" (
    "slug" TEXT NOT NULL,
    "dirName" TEXT NOT NULL,
    "keys" JSONB,
    "categories" "AppCategories"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "App_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "hashedKey" TEXT NOT NULL,
    "appId" TEXT,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Waitlist" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT,
    "teamSize" TEXT,
    "useCase" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Waitlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sampleText" TEXT NOT NULL,
    "icon" TEXT,
    "category" TEXT,
    "variables" JSONB,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isUserCustom" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAction" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "canUndo" BOOLEAN NOT NULL DEFAULT true,
    "undoExpiresAt" TIMESTAMP(3),
    "undoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_sub_key" ON "User"("sub");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_ownerUserId_key" ON "Workspace"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_teamId_userId_key" ON "TeamMember"("teamId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Chat_runId_key" ON "Chat"("runId");

-- CreateIndex
CREATE INDEX "Chat_userId_createdAt_idx" ON "Chat"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Chat_teamId_createdAt_idx" ON "Chat"("teamId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatItem_chatId_createdAt_idx" ON "ChatItem"("chatId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatItem_runId_createdAt_idx" ON "ChatItem"("runId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RunEffect_idempotencyKey_key" ON "RunEffect"("idempotencyKey");

-- CreateIndex
CREATE INDEX "RunEffect_runId_idx" ON "RunEffect"("runId");

-- CreateIndex
CREATE INDEX "RunEffect_idempotencyKey_idx" ON "RunEffect"("idempotencyKey");

-- CreateIndex
CREATE INDEX "LLMLog_userId_idx" ON "LLMLog"("userId");

-- CreateIndex
CREATE INDEX "LLMLog_teamId_idx" ON "LLMLog"("teamId");

-- CreateIndex
CREATE INDEX "LLMLog_createdAt_idx" ON "LLMLog"("createdAt");

-- CreateIndex
CREATE INDEX "LLMLog_userId_createdAt_idx" ON "LLMLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Credential_userId_idx" ON "Credential"("userId");

-- CreateIndex
CREATE INDEX "Credential_appId_idx" ON "Credential"("appId");

-- CreateIndex
CREATE INDEX "Credential_teamId_idx" ON "Credential"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "Credential_userId_appId_emailOrUserName_key" ON "Credential"("userId", "appId", "emailOrUserName");

-- CreateIndex
CREATE UNIQUE INDEX "App_slug_key" ON "App"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "App_dirName_key" ON "App"("dirName");

-- CreateIndex
CREATE INDEX "App_enabled_idx" ON "App"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_id_key" ON "ApiKey"("id");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_hashedKey_key" ON "ApiKey"("hashedKey");

-- CreateIndex
CREATE INDEX "ApiKey_userId_idx" ON "ApiKey"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Waitlist_email_key" ON "Waitlist"("email");

-- CreateIndex
CREATE INDEX "EmailAction_messageId_idx" ON "EmailAction"("messageId");

-- CreateIndex
CREATE INDEX "EmailAction_userId_idx" ON "EmailAction"("userId");

-- CreateIndex
CREATE INDEX "EmailAction_runId_idx" ON "EmailAction"("runId");

-- CreateIndex
CREATE INDEX "EmailAction_undoExpiresAt_idx" ON "EmailAction"("undoExpiresAt");

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatItem" ADD CONSTRAINT "ChatItem_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatItem" ADD CONSTRAINT "ChatItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatItem" ADD CONSTRAINT "ChatItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatItem" ADD CONSTRAINT "ChatItem_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Step" ADD CONSTRAINT "Step_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunScopedKey" ADD CONSTRAINT "RunScopedKey_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunEffect" ADD CONSTRAINT "RunEffect_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LLMLog" ADD CONSTRAINT "LLMLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LLMLog" ADD CONSTRAINT "LLMLog_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("slug") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("slug") ON DELETE CASCADE ON UPDATE CASCADE;
