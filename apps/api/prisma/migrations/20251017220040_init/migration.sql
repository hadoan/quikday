-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "sub" TEXT NOT NULL,
    "email" TEXT,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
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
    "teamId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "intent" JSONB,
    "config" JSONB,
    "output" JSONB,
    "error" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Step" (
    "id" SERIAL NOT NULL,
    "runId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "request" JSONB,
    "response" JSONB,
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

-- CreateIndex
CREATE UNIQUE INDEX "User_sub_key" ON "User"("sub");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_teamId_userId_key" ON "TeamMember"("teamId", "userId");

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Step" ADD CONSTRAINT "Step_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunScopedKey" ADD CONSTRAINT "RunScopedKey_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
