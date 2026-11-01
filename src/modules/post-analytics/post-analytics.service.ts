/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_GRAPH_API_VERSION, MetaService } from '../meta/meta.service';
import { TokenCipher } from '../../utils/token-cipher';
import { MetaGraphErrorResponse } from '../meta/meta.types';
import { MetaPostInsightsResponse } from './post-analytics.types';
import { Prisma } from '@prisma/client';
import { Cron, CronExpression } from '@nestjs/schedule';

const POST_METRICS: Record<string, Record<string, string[]>> = {
  instagram: {
    post: [
      'views',
      'reach',
      'likes',
      'comments',
      'shares',
      'saved',
      'total_interactions',
      'profile_visits',
      'follows',
    ],
    reel: [
      'views',
      'reach',
      'likes',
      'comments',
      'shares',
      'saved',
      'total_interactions',
      'ig_reels_avg_watch_time',
    ],
    story: ['views', 'reach', 'replies'],
  },
  facebook: {
    post: [
      'post_media_view',
      'post_total_media_view_unique',
      'post_clicks',
      'post_reactions_like_total',
    ],
    reel: [
      'post_media_view',
      'post_clicks',
      'post_video_views',
      'post_video_avg_time_watched',
    ],
    story: [],
  },
};

const postSyncTargetInclude = {
  post: { include: { facebook_page: true } },
} satisfies Prisma.PostTargetInclude;

type PostSyncTarget = Prisma.PostTargetGetPayload<{
  include: typeof postSyncTargetInclude;
}>;

@Injectable()
export class PostAnalyticsService {
  private readonly logger = new Logger(PostAnalyticsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly meta: MetaService,
  ) {}
  @Cron(CronExpression.EVERY_10_SECONDS)
  async postAnalyticsJob() {
    const capturedAt = new Date();
    capturedAt.setHours(0, 0, 0, 0);
    const targets = await this.prisma.postTarget.findMany({
      where: {
        status: 'published',
        external_post_id: { not: null },
        published_at: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
      },
      include: postSyncTargetInclude,
    });

    for (const target of targets) {
      const metrics = (
        POST_METRICS[target.platform]?.[target.post.type] ?? []
      ).join(',');
      try {
        await this.syncTarget(metrics, capturedAt, target);
      } catch (error) {
        this.logger.error(
          `Failed to sync analytics for target ${target.id}`,
          error,
        );
      }
    }
  }

  async getWorkspacePostAnalytics(user_id: number, workspace_id: number) {
    if (!workspace_id) return;

    await this.meta.assertWorkspaceOwnership(user_id, workspace_id);

    const postsWithTargetsAnalytics = await this.prisma.post.findMany({
      where: { workspace_id: workspace_id },
      include: { targets: { include: { postAnalytics: true } } },
    });

    return postsWithTargetsAnalytics;
  }

  async getSinglePostAnalytics(
    user_id: number,
    workspace_id: number,
    post_id: number,
  ) {
    if (!post_id || !workspace_id) return;

    await this.meta.assertWorkspaceOwnership(user_id, workspace_id);

    const foundPost = await this.prisma.post.findFirstOrThrow({
      where: {
        workspace_id: workspace_id,
        id: post_id,
      },
      include: { targets: { include: { postAnalytics: true } } },
    });

    if (!foundPost) return;

    return foundPost;
  }

  // PRIVATE FUNCTIONS //

  private async syncTarget(
    metrics: string,
    capturedAt: Date,
    postTarget: PostSyncTarget,
  ) {
    const token = this.cipher.decrypt(
      postTarget.post.facebook_page.page_access_token,
    );
    const post_target_id = postTarget.id;
    const external_post_id = postTarget.external_post_id;
    if (external_post_id) {
      const result = metrics
        ? await this.fetchAnalytics(token, metrics, external_post_id)
        : { data: [] };

      for (const item of result.data) {
        const latest = item.values[0]?.value;
        if (typeof latest !== 'number') continue;
        await this.upsertMetric(post_target_id, item.name, latest, capturedAt);
      }
    }
  }

  private async fetchAnalytics(
    token: string,
    metrics: string,
    external_post_id: string,
  ) {
    const url = new URL(
      `https://graph.facebook.com/${this.graphVersion}/${external_post_id}/insights`,
    );

    url.searchParams.set('metric', metrics);
    url.searchParams.set('access_token', token);

    return await this.request<MetaPostInsightsResponse>(url);
  }

  private async upsertMetric(
    post_target_id: number,
    metric: string,
    value: unknown,
    captured_at: Date,
  ) {
    if (typeof value !== 'number') return;

    await this.prisma.postAnalytics.upsert({
      where: {
        post_target_id_metric_captured_at: {
          post_target_id: post_target_id,
          captured_at: captured_at,
          metric: metric,
        },
      },
      create: {
        post_target_id: post_target_id,
        captured_at: captured_at,
        metric: metric,
        value: value,
      },
      update: { value },
    });
  }

  private async request<T>(url: URL): Promise<T> {
    const response = await fetch(url.toString());
    const body = (await response.json()) as T | MetaGraphErrorResponse;

    if (!response.ok || (body as MetaGraphErrorResponse).error) {
      const message =
        (body as MetaGraphErrorResponse).error?.message ??
        'Meta Graph API request failed';
      throw new BadRequestException(message);
    }

    return body as T;
  }

  private get graphVersion(): string {
    return (
      this.config.get<string>('META_GRAPH_API_VERSION') ??
      DEFAULT_GRAPH_API_VERSION
    );
  }

  private get cipher(): TokenCipher {
    return TokenCipher.fromBase64(
      this.getRequiredConfig('TOKEN_ENCRYPTION_KEY'),
    );
  }

  private getRequiredConfig(key: string): string {
    const value = this.config.get<string>(key);
    if (!value) {
      throw new Error(`${key} is not configured`);
    }
    return value;
  }
}
