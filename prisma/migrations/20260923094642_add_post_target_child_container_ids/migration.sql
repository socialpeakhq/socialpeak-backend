-- AlterTable
ALTER TABLE "PostTarget" ADD COLUMN     "child_container_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
