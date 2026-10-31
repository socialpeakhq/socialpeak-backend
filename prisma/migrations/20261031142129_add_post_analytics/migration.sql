-- CreateTable
CREATE TABLE "PostAnalytics" (
    "id" SERIAL NOT NULL,
    "post_target_id" INTEGER NOT NULL,
    "metric" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostAnalytics_post_target_id_captured_at_idx" ON "PostAnalytics"("post_target_id", "captured_at");

-- CreateIndex
CREATE UNIQUE INDEX "PostAnalytics_post_target_id_metric_captured_at_key" ON "PostAnalytics"("post_target_id", "metric", "captured_at");

-- AddForeignKey
ALTER TABLE "PostAnalytics" ADD CONSTRAINT "PostAnalytics_post_target_id_fkey" FOREIGN KEY ("post_target_id") REFERENCES "PostTarget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
