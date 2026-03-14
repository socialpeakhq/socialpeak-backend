/*
  Warnings:

  - You are about to drop the column `phoneNumber` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "phoneNumber",
ADD COLUMN     "has_connected_workspace" BOOLEAN,
ADD COLUMN     "phone_number" TEXT,
ADD COLUMN     "token" TEXT,
ADD COLUMN     "workspace_id" INTEGER;
