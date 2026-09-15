-- CreateTable
CREATE TABLE "Post" (
    "id" SERIAL NOT NULL,
    "workspace_id" INTEGER NOT NULL,
    "facebook_page_id" INTEGER NOT NULL,
    "caption" TEXT NOT NULL,
    "media_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostTarget" (
    "id" SERIAL NOT NULL,
    "post_id" INTEGER NOT NULL,
    "platform" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "external_post_id" TEXT,
    "error_message" TEXT,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "PostTarget_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "Workspace"("workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_facebook_page_id_fkey" FOREIGN KEY ("facebook_page_id") REFERENCES "FacebookPage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostTarget" ADD CONSTRAINT "PostTarget_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
