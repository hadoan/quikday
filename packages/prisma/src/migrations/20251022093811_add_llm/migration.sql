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

-- CreateIndex
CREATE INDEX "LLMLog_userId_idx" ON "LLMLog"("userId");

-- CreateIndex
CREATE INDEX "LLMLog_teamId_idx" ON "LLMLog"("teamId");

-- CreateIndex
CREATE INDEX "LLMLog_createdAt_idx" ON "LLMLog"("createdAt");

-- CreateIndex
CREATE INDEX "LLMLog_userId_createdAt_idx" ON "LLMLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "LLMLog" ADD CONSTRAINT "LLMLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LLMLog" ADD CONSTRAINT "LLMLog_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
