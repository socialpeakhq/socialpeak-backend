/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_GRAPH_API_VERSION, MetaService } from '../meta/meta.service';
import { TokenCipher } from '../../utils/token-cipher';
import { MetaGraphErrorResponse } from '../meta/meta.types';
import {
  MetaPostInsightsResponse,
  MetricAnalytics,
  MetricBaseline,
  SinglePostAnalyticsResponse,
  TargetAnalytics,
} from './post-analytics.types';
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

type PostTargetWithAnalytics = Prisma.PostTargetGetPayload<{
  include: { postAnalytics: true };
}>;

type AnalyticsRow = { metric: string; value: number; captured_at: Date };

type PoolTarget = {
  published_at: Date | null;
  postAnalytics: AnalyticsRow[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const TRACKING_WINDOW_DAYS = 14;
const MIN_BASELINE_SAMPLE = 3;
const ALLOWED_PERIODS = [7, 30, 90];

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Days between the publish day and `date`, both at midnight. Rounded so a DST
// shift (23h or 25h days) doesn't knock the index off by one.
function dayIndex(date: Date, published_at: Date): number {
  return Math.round(
    (startOfDay(date).getTime() - startOfDay(published_at).getTime()) / DAY_MS,
  );
}

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Median of each comparable post's value for `metric` on the same day of age.
// Posts with no row for that day (too young, or a missed cron day) are left out.
function computeBaseline(
  pool: PoolTarget[],
  metric: string,
  compared_at_day: number,
): MetricBaseline | null {
  const values: number[] = [];

  for (const other of pool) {
    if (!other.published_at) continue;
    const publishedAt = other.published_at;
    const row = other.postAnalytics.find(
      (r) =>
        r.metric === metric &&
        dayIndex(r.captured_at, publishedAt) === compared_at_day,
    );
    if (row) values.push(row.value);
  }

  if (values.length < MIN_BASELINE_SAMPLE) return null;

  return { typical: median(values), sample: values.length, compared_at_day };
}

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
    await this.meta.assertWorkspaceOwnership(user_id, workspace_id);

    const postsWithTargetsAnalytics = await this.prisma.post.findMany({
      where: { workspace_id: workspace_id },
      include: {
        targets: {
          include: { postAnalytics: { orderBy: { captured_at: 'asc' } } },
        },
      },
    });

    return postsWithTargetsAnalytics;
  }

  async getSinglePostAnalytics(
    user_id: number,
    workspace_id: number,
    post_id: number,
    period_days: number,
  ): Promise<SinglePostAnalyticsResponse> {
    if (!ALLOWED_PERIODS.includes(period_days)) {
      throw new BadRequestException(
        `days must be one of ${ALLOWED_PERIODS.join(', ')}`,
      );
    }

    await this.meta.assertWorkspaceOwnership(user_id, workspace_id);

    const foundPost = await this.prisma.post.findFirst({
      where: { workspace_id, id: post_id },
      include: {
        targets: {
          include: { postAnalytics: { orderBy: { captured_at: 'asc' } } },
        },
      },
    });

    if (!foundPost) throw new NotFoundException('Post not found');

    const today = startOfDay(new Date());
    const periodStart = new Date(today.getTime() - period_days * DAY_MS);

    const targets = await Promise.all<TargetAnalytics>(
      foundPost.targets.map(
        (target: PostTargetWithAnalytics): Promise<TargetAnalytics> =>
          this.buildTargetAnalytics(
            target,
            foundPost.type,
            workspace_id,
            today,
            periodStart,
          ),
      ),
    );

    const publishedDates = foundPost.targets
      .map((t) => t.published_at)
      .filter((d): d is Date => d !== null);

    return {
      post: {
        id: foundPost.id,
        type: foundPost.type,
        caption: foundPost.caption,
        media_urls: foundPost.media_urls,
        published_at: publishedDates.length
          ? new Date(Math.min(...publishedDates.map((d) => d.getTime())))
          : null,
      },
      period_days,
      targets,
    };
  }

  // PRIVATE FUNCTIONS //

  private async buildTargetAnalytics(
    target: PostTargetWithAnalytics,
    post_type: string,
    workspace_id: number,
    today: Date,
    periodStart: Date,
  ): Promise<TargetAnalytics> {
    const base = { target_id: target.id, platform: target.platform };

    if (target.status !== 'published' || !target.published_at) {
      return { ...base, status: 'not_published', age_days: null, metrics: [] };
    }

    const published_at = target.published_at;
    const age_days = dayIndex(today, published_at);

    if (target.postAnalytics.length === 0) {
      return {
        ...base,
        status: age_days < 1 ? 'collecting' : 'unavailable',
        age_days,
        metrics: [],
      };
    }

    const rowsByMetric = new Map<string, AnalyticsRow[]>();
    for (const row of target.postAnalytics) {
      const rows = rowsByMetric.get(row.metric) ?? [];
      rows.push(row);
      rowsByMetric.set(row.metric, rows);
    }

    // Comparison pool: other published targets on the same platform, same post
    // type and workspace, published within the selected period.
    const pool = await this.prisma.postTarget.findMany({
      where: {
        id: { not: target.id },
        platform: target.platform,
        status: 'published',
        published_at: { gte: periodStart },
        post: { workspace_id, type: post_type },
      },
      select: {
        published_at: true,
        postAnalytics: {
          select: { metric: true, value: true, captured_at: true },
        },
      },
    });

    const metrics: MetricAnalytics[] = [...rowsByMetric.entries()].map(
      ([metric, rows]) => {
        const latest = rows[rows.length - 1];
        // Compare at the age of this post's own latest data point, so a
        // still-growing post isn't measured against other posts' final totals.
        const compared_at_day = Math.min(
          dayIndex(latest.captured_at, published_at),
          TRACKING_WINDOW_DAYS,
        );

        return {
          metric,
          value: latest.value,
          series: rows.map((r) => ({
            date: toDateKey(r.captured_at),
            value: r.value,
          })),
          baseline: computeBaseline(pool, metric, compared_at_day),
        };
      },
    );

    return { ...base, status: 'value', age_days, metrics };
  }

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
