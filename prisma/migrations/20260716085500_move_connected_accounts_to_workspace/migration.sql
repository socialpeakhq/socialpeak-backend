-- AlterTable
ALTER TABLE "User" DROP COLUMN "connected_accounts";

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "connected_accounts" TEXT[] DEFAULT ARRAY[]::TEXT[];
