import {
  BadRequestException,
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
import { startOfDay, subDays } from 'date-fns';

const page_default_metrics = '';
const page_total_value_metrics =
  'page_follows,page_views_total,page_post_engagements,page_actions_post_reactions_total';

const instagram_default_metrics = 'follower_count';
const instagram_total_value_metrics =
  'reach,profile_views,likes,comments,views,content_views,reposts';

@Injectable()
export class MetaInsightsService {
  private readonly logger = new Logger(MetaInsightsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
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
