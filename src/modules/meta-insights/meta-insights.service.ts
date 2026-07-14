/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/require-await */
import { BadRequestException, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { FacebookPage } from '@prisma/client';
import { MetaGraphErrorResponse } from '../meta/meta.types';

@Injectable()
export class MetaInsightsService {
  constructor(private readonly prisma: PrismaService) {}
  @Cron(CronExpression.EVERY_10_SECONDS)
  async getMetaInsights() {
    const pages = await this.prisma.facebookPage.findMany();
    for (const page of pages) {
      await this.syncOneAccount(page);
    }
  }

  async syncOneAccount(page: FacebookPage) {
    const default_metrics =
      'reach,follower_count,profile_views,likes,comments,views';

    // For create an initial call for the facebook page ( you may need token for it )
    // If the page also has an instagram account linked, run the syncOneAccount with the instagram account id
    // Save the data by metric value ( EAV TABLE IDEA )
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
}
