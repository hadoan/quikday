-- CreateEnum
CREATE TYPE "AppCategories" AS ENUM ('calendar', 'email', 'messaging', 'other', 'payment', 'web3', 'automation', 'analytics', 'conferencing', 'crm', 'social', 'cloudstorage', 'ai');

-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "policySnapshot" JSONB,
ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ADD COLUMN     "toolAllowlist" JSONB;

-- AlterTable
ALTER TABLE "Step" ADD COLUMN     "appId" TEXT,
ADD COLUMN     "credentialId" INTEGER,
ADD COLUMN     "errorCode" TEXT;

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

-- CreateIndex
CREATE UNIQUE INDEX "RunEffect_idempotencyKey_key" ON "RunEffect"("idempotencyKey");

-- CreateIndex
CREATE INDEX "RunEffect_runId_idx" ON "RunEffect"("runId");

-- CreateIndex
CREATE INDEX "RunEffect_idempotencyKey_idx" ON "RunEffect"("idempotencyKey");

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

-- AddForeignKey
ALTER TABLE "RunEffect" ADD CONSTRAINT "RunEffect_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
