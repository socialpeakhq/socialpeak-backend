-- CreateTable
CREATE TABLE "InsightsSnapshots" (
    "id" SERIAL NOT NULL,
    "facebook_page_id" INTEGER NOT NULL,
    "platform" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsightsSnapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InsightsSnapshots_facebook_page_id_captured_at_idx" ON "InsightsSnapshots"("facebook_page_id", "captured_at");

-- CreateIndex
CREATE UNIQUE INDEX "InsightsSnapshots_facebook_page_id_platform_metric_captured_key" ON "InsightsSnapshots"("facebook_page_id", "platform", "metric", "captured_at");

-- AddForeignKey
ALTER TABLE "InsightsSnapshots" ADD CONSTRAINT "InsightsSnapshots_facebook_page_id_fkey" FOREIGN KEY ("facebook_page_id") REFERENCES "FacebookPage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
