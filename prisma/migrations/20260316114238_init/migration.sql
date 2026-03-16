/*
  Warnings:

  - Made the column `phone_number` on table `User` required. This step will fail if there are existing NULL values in that column.
  - Made the column `token` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "User" ALTER COLUMN "has_connected_workspace" SET DEFAULT false,
ALTER COLUMN "phone_number" SET NOT NULL,
ALTER COLUMN "token" SET NOT NULL;
