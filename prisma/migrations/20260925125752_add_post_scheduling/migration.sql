-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "scheduled_at" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'fired';
