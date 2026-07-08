-- CreateTable
CREATE TABLE "MetaConnection" (
    "id" SERIAL NOT NULL,
    "workspace_id" INTEGER NOT NULL,
    "linked_by_id" INTEGER NOT NULL,
    "user_access_token" TEXT NOT NULL,
    "user_access_token_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacebookPage" (
    "id" SERIAL NOT NULL,
    "workspace_id" INTEGER NOT NULL,
    "page_id" TEXT NOT NULL,
    "page_name" TEXT NOT NULL,
    "page_access_token" TEXT NOT NULL,
    "instagram_account_id" TEXT,
    "instagram_username" TEXT,
    "instagram_name" TEXT,
    "instagram_profile_picture_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacebookPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MetaConnection_workspace_id_key" ON "MetaConnection"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "FacebookPage_page_id_key" ON "FacebookPage"("page_id");

-- CreateIndex
CREATE UNIQUE INDEX "FacebookPage_instagram_account_id_key" ON "FacebookPage"("instagram_account_id");

-- CreateIndex
CREATE INDEX "FacebookPage_workspace_id_idx" ON "FacebookPage"("workspace_id");

-- AddForeignKey
ALTER TABLE "MetaConnection" ADD CONSTRAINT "MetaConnection_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "Workspace"("workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaConnection" ADD CONSTRAINT "MetaConnection_linked_by_id_fkey" FOREIGN KEY ("linked_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacebookPage" ADD CONSTRAINT "FacebookPage_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "Workspace"("workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;
