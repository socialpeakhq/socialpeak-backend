-- CreateTable
CREATE TABLE "Workspace" (
    "workspace_id" SERIAL NOT NULL,
    "owner_id" INTEGER NOT NULL,
    "workspace_name" TEXT NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("workspace_id")
);

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
