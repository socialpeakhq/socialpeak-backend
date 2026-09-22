-- AlterTable
-- Add "type" as nullable first so existing rows aren't rejected, backfill
-- them, then enforce NOT NULL.
ALTER TABLE "Post" ADD COLUMN     "type" TEXT;

-- Backfill existing rows: every Post created before this migration was
-- created through the photo-upload flow (createPost), since createVideoPost
-- and createStory are unreleased.
UPDATE "Post" SET "type" = 'photo' WHERE "type" IS NULL;

ALTER TABLE "Post" ALTER COLUMN "type" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "PostTarget_post_id_platform_key" ON "PostTarget"("post_id", "platform");
