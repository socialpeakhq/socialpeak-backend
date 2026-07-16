-- AlterTable
ALTER TABLE "User" ADD COLUMN     "connected_accounts" TEXT[] DEFAULT ARRAY[]::TEXT[];
