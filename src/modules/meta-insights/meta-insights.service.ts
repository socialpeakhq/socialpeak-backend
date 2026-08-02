import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import {
  MetaGraphErrorResponse,
  MetaInsightsResponse,
} from '../meta/meta.types';
import { DEFAULT_GRAPH_API_VERSION, MetaService } from '../meta/meta.service';
import { ConfigService } from '@nestjs/config';
import { TokenCipher } from '../../utils/token-cipher';
import { FacebookPage, InsightsSnapshots } from '@prisma/client';
import { differenceInMinutes, startOfDay, sub, subDays } from 'date-fns';
import { ManualInsights } from './dtos/ManualInsights.dto';

const page_default_metrics = '';
const page_total_value_metrics =
  'page_follows,page_views_total,page_post_engagements,page_actions_post_reactions_total,page_total_media_view_unique';

const instagram_default_metrics = 'follower_count';
const instagram_total_value_metrics =
  'reach,profile_views,likes,comments,views,content_views,reposts';

@Injectable()
export class MetaInsightsService {
  private readonly logger = new Logger(MetaInsightsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => MetaService))
    private readonly metaService: MetaService,
  ) {}
  @Cron(CronExpression.EVERY_10_SECONDS)
  async metaInsightsJob() {
    const pages = await this.prisma.facebookPage.findMany();
    for (const page of pages) {
      try {
        await this.syncOneAccount(page);
      } catch (error) {
        this.logger.error(
          `Failed to sync insights for page ${page.page_id}`,
          error instanceof Error ? error.stack : error,
        );
        if (error instanceof Error && error.cause) {
          this.logger.error('Cause:', error.cause);
        }
      }
    }
  }

  async syncOneAccountManually(userId: number, data: ManualInsights) {
    const nowDate = new Date();
    const { page_id, workspaceId } = data;
    await this.metaService.assertWorkspaceOwnership(userId, workspaceId);
    const latest = this.prisma.insightsSnapshots.aggregate({
      where: { facebook_page_id: page_id },
      _max: { created_at: true },
    });

    if (!(await latest)._max.created_at) return [];

    if (differenceInMinutes(nowDate, (await latest)._max.created_at!) < 5) {
      throw new BadRequestException('Please wait before requesting a new sync');
    } else {
      const page = await this.prisma.facebookPage.findFirst({
        where: { id: page_id },
      });

      if (page) {
        await this.syncOneAccount(page);
      }
    }
  }

  async syncOneAccount(page: FacebookPage) {
    const token = this.cipher.decrypt(page.page_access_token);
    const capturedAt: Date = startOfDay(subDays(new Date(), 1));
    await this.syncPlatform(
      page.id,
      page.page_id,
      token,
      'facebook',
      page_default_metrics,
      page_total_value_metrics,
      capturedAt,
    );

    if (page.instagram_account_id) {
      await this.syncPlatform(
        page.id,
        page.instagram_account_id,
        token,
        'instagram',
        instagram_default_metrics,
        instagram_total_value_metrics,
        capturedAt,
      );
    }
  }

  async getMetaInsights(userId: number, workspaceId: number, platform: string) {
    await this.metaService.assertWorkspaceOwnership(userId, workspaceId);

    const pageOfWorkspace = await this.prisma.facebookPage.findFirst({
      where: { workspace_id: workspaceId },
    });

    let data: InsightsSnapshots[] = [];
    if (pageOfWorkspace) {
      data = await this.prisma.insightsSnapshots.findMany({
        where: {
          platform: platform,
          captured_at: startOfDay(subDays(new Date(), 1)),
          facebook_page_id: pageOfWorkspace.id,
        },
      });
      return data;
    } else {
      throw new NotFoundException('Data for the facebook page not found');
    }
  }

  async backfillWorkspaceHistory(workspaceId: number) {
    const pages = await this.prisma.facebookPage.findMany({
      where: { workspace_id: workspaceId },
    });

    for (const page of pages) {
      try {
        await this.backfillHistory(page);
      } catch (error) {
        this.logger.error(
          `Failed to backfill insights for page ${page.page_id}`,
          error instanceof Error ? error.stack : error,
        );
      }
    }
  }

  async getPlatformAudience(
    userId: number,
    workspaceId: number,
    pageId: number,
    platform: string,
    date: string,
  ) {
    await this.metaService.assertWorkspaceOwnership(userId, workspaceId);
    const maxCapturedAtDate = startOfDay(
      sub(new Date(), {
        days: date === '7d' ? 7 : date === '30d' ? 30 : 90,
      }),
    );

    if (maxCapturedAtDate) {
      try {
        const filteredData = await this.prisma.insightsSnapshots.findMany({
          where: {
            facebook_page_id: pageId,
            platform: platform,
            captured_at: {
              gte: maxCapturedAtDate,
            },
          },
        });

        return filteredData;
      } catch (error) {
        throw new BadRequestException(error);
      }
    } else {
      throw new BadRequestException('Dates do not exist');
    }
  }

  // CLASS PRIVATE HELPER FUNCTIONS //

  private async backfillHistory(page: FacebookPage) {
    const token = this.cipher.decrypt(page.page_access_token);

    await this.backfillPlatform(
      page.id,
      page.page_id,
      token,
      'facebook',
      page_default_metrics,
    );

    if (page.instagram_account_id) {
      await this.backfillPlatform(
        page.id,
        page.instagram_account_id,
        token,
        'instagram',
        instagram_default_metrics,
      );
    }
  }

  private async backfillPlatform(
    facebookPageId: number,
    nodeId: string,
    token: string,
    platform: 'facebook' | 'instagram',
    defaultMetrics: string,
  ) {
    if (!defaultMetrics) return;

    const since = subDays(new Date(), 90);
    const until = subDays(new Date(), 1);

    const result = await this.fetchInsightsRange(
      nodeId,
      token,
      defaultMetrics,
      since,
      until,
    );

    for (const item of result.data) {
      for (const point of item.values ?? []) {
        const capturedAt = startOfDay(new Date(point.end_time));
        await this.upsertMetric(
          facebookPageId,
          platform,
          item.name,
          point.value,
          capturedAt,
        );
      }
    }
  }

  // CLASS ONLY METHODS (HELPER FUNCTION) //

  private async syncPlatform(
    facebookPageId: number,
    nodeId: string,
    token: string,
    platform: 'facebook' | 'instagram',
    defaultMetrics: string,
    totalValueMetrics: string,
    capturedAt: Date,
  ) {
    const [defaultResult, totalValueResult] = await Promise.all([
      defaultMetrics
        ? this.fetchInsights(nodeId, token, defaultMetrics, false)
        : { data: [] },
      totalValueMetrics
        ? this.fetchInsights(nodeId, token, totalValueMetrics, true)
        : { data: [] },
    ]);

    for (const item of totalValueResult.data) {
      await this.upsertMetric(
        facebookPageId,
        platform,
        item.name,
        item.total_value?.value,
        capturedAt,
      );
    }

    for (const item of defaultResult.data) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const latest = item.values && item.values[0].value;
      if (typeof latest !== 'number') continue;
      await this.upsertMetric(
        facebookPageId,
        platform,
        item.name,
        latest,
        capturedAt,
      );
    }
  }

  private async fetchInsights(
    id: string,
    token: string,
    metrics: string,
    useTotalValue: boolean,
  ) {
    const url = new URL(
      `https://graph.facebook.com/${this.graphVersion}/${id}/insights`,
    );

    url.searchParams.set('metric', metrics);
    url.searchParams.set('period', 'day');
    if (useTotalValue) url.searchParams.set('metric_type', 'total_value');
    url.searchParams.set('access_token', token);

    return await this.request<MetaInsightsResponse>(url);
  }

  private async fetchInsightsRange(
    id: string,
    token: string,
    metrics: string,
    since: Date,
    until: Date,
  ) {
    const url = new URL(
      `https://graph.facebook.com/${this.graphVersion}/${id}/insights`,
    );

    url.searchParams.set('metric', metrics);
    url.searchParams.set('period', 'day');
    url.searchParams.set(
      'since',
      Math.floor(since.getTime() / 1000).toString(),
    );
    url.searchParams.set(
      'until',
      Math.floor(until.getTime() / 1000).toString(),
    );
    url.searchParams.set('access_token', token);

    return await this.request<MetaInsightsResponse>(url);
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

  private async upsertMetric(
    facebookPageId: number,
    platform: 'facebook' | 'instagram',
    metric: string,
    value: unknown,
    capturedAt: Date,
  ) {
    if (typeof value !== 'number') return;

    await this.prisma.insightsSnapshots.upsert({
      where: {
        facebook_page_id_platform_metric_captured_at: {
          facebook_page_id: facebookPageId,
          platform,
          metric,
          captured_at: capturedAt,
        },
      },
      create: {
        facebook_page_id: facebookPageId,
        platform,
        metric,
        value,
        captured_at: capturedAt,
        created_at: new Date(),
      },
      update: { value },
    });
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
