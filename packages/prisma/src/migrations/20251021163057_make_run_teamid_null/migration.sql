-- DropForeignKey
ALTER TABLE "Run" DROP CONSTRAINT "Run_teamId_fkey";

-- AlterTable
ALTER TABLE "Run" ALTER COLUMN "teamId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
