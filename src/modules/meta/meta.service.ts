import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { FacebookPage, MetaConnection, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenCipher } from '../../utils/token-cipher';
import {
  FetchedPage,
  MetaCallbackQuery,
  MetaLinkResult,
  MetaPopupMessage,
  MetaStatePayload,
  MetaGraphErrorResponse,
  MetaInstagramBusinessAccount,
  MetaPagesResponse,
  MetaTokenResponse,
  WorkspaceLinkedPage,
} from './meta.types';

const STATE_AUDIENCE = 'meta-oauth-state';
const STATE_TTL = '10m';

export const DEFAULT_GRAPH_API_VERSION = 'v21.0';
const DEFAULT_SCOPES = [
  'instagram_basic',
  'pages_show_list',
  'pages_read_engagement',
  'instagram_manage_insights',
  'business_management',
  'pages_manage_posts',
  'instagram_content_publish',
].join(',');

@Injectable()
export class MetaService {
  private readonly logger = new Logger(MetaService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async createAuthorizationUrl(
    userId: number,
    workspaceId: number,
  ): Promise<string> {
    await this.assertWorkspaceOwnership(userId, workspaceId);

    const state = await this.jwtService.signAsync(
      {
        sub: userId,
        workspace_id: workspaceId,
        nonce: randomUUID(),
      } satisfies MetaStatePayload,
      {
        secret: this.stateSecret,
        expiresIn: STATE_TTL,
        audience: STATE_AUDIENCE,
      },
    );

    const url = new URL(
      `https://www.facebook.com/${this.graphVersion}/dialog/oauth`,
    );
    url.searchParams.set('client_id', this.appId);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', this.scopes);

    return url.toString();
  }

  async handleCallback(code: string, state: string): Promise<MetaLinkResult> {
    const { sub: userId, workspace_id: workspaceId } =
      await this.verifyState(state);
    await this.assertWorkspaceOwnership(userId, workspaceId);

    const shortLivedToken = await this.exchangeCodeForToken(code);
    const longLivedToken = await this.exchangeForLongLivedToken(
      shortLivedToken.access_token,
    );
    const fetchedPages = await this.fetchPages(longLivedToken.access_token);

    return this.persistLinkedAccounts(
      workspaceId,
      userId,
      longLivedToken,
      fetchedPages,
    );
  }

  async processCallback(query: MetaCallbackQuery): Promise<MetaPopupMessage> {
    if (query.error) {
      return {
        linked: false,
        error: query.error,
        error_description: query.error_description ?? query.error_reason,
      };
    }

    if (!query.code || !query.state) {
      return {
        linked: false,
        error: 'invalid_request',
        error_description: 'Missing code or state parameter',
      };
    }

    try {
      const result = await this.handleCallback(query.code, query.state);
      return { linked: true, ...result };
    } catch (error) {
      const description =
        error instanceof HttpException
          ? error.message
          : 'Failed to link Meta account';
      return {
        linked: false,
        error: 'link_failed',
        error_description: description,
      };
    }
  }

  buildPopupResponse(payload: MetaPopupMessage): {
    html: string;
    nonce: string;
  } {
    const frontendOrigin = this.getRequiredConfig('FRONTEND_URL');
    const nonce = randomUUID();
    const message = JSON.stringify({
      source: 'meta-oauth',
      ...payload,
    }).replace(/</g, '\\u003c');

    const html = `<!doctype html>
<html>
  <body>
    <script nonce="${nonce}">
      if (window.opener) {
        window.opener.postMessage(${message}, ${JSON.stringify(frontendOrigin)});
      }
      window.close();
    </script>
  </body>
</html>`;

    return { html, nonce };
  }

  async getWorkspaceAccounts(
    userId: number,
    workspaceId: number,
  ): Promise<WorkspaceLinkedPage[]> {
    await this.assertWorkspaceOwnership(userId, workspaceId);

    const pages = await this.prisma.facebookPage.findMany({
      where: { workspace_id: workspaceId },
      orderBy: { updated_at: 'desc' },
    });

    return pages.map((page) => this.toWorkspaceLinkedPage(page));
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async refreshExpiringConnections() {
    const refreshThreshold = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const connections = await this.prisma.metaConnection.findMany({
      where: { user_access_token_expires_at: { lte: refreshThreshold } },
    });

    for (const connection of connections) {
      try {
        await this.refreshConnection(connection);
      } catch (error) {
        this.logger.error(
          `Failed to refresh Meta token for workspace ${connection.workspace_id}`,
          error instanceof Error ? error.stack : error,
        );
      }
    }
  }

  private async refreshConnection(connection: MetaConnection) {
    const currentToken = this.cipher.decrypt(connection.user_access_token);
    const refreshed = await this.exchangeForLongLivedToken(currentToken);
    const newExpiresAt = refreshed.expires_in
      ? new Date(Date.now() + refreshed.expires_in * 1000)
      : null;

    const fetchedPages = await this.fetchPages(refreshed.access_token);

    await this.prisma.$transaction([
      this.prisma.metaConnection.update({
        where: { id: connection.id },
        data: {
          user_access_token: this.cipher.encrypt(refreshed.access_token),
          user_access_token_expires_at: newExpiresAt,
        },
      }),
      ...fetchedPages.map((page) =>
        this.prisma.facebookPage.update({
          where: { page_id: page.page_id },
          data: {
            page_access_token: this.cipher.encrypt(page.page_access_token),
          },
        }),
      ),
    ]);
  }

  // PRIVATE SERVICES //

  async assertWorkspaceOwnership(
    userId: number,
    workspaceId: number,
  ): Promise<void> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { workspace_id: workspaceId },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    if (workspace.owner_id !== userId) {
      throw new ForbiddenException('You do not have access to this workspace');
    }
  }

  private async persistLinkedAccounts(
    workspaceId: number,
    userId: number,
    longLivedToken: MetaTokenResponse,
    fetchedPages: FetchedPage[],
  ): Promise<MetaLinkResult> {
    const userAccessTokenExpiresAt = longLivedToken.expires_in
      ? new Date(Date.now() + longLivedToken.expires_in * 1000)
      : null;

    const workspace = await this.prisma.workspace.findUnique({
      where: { workspace_id: workspaceId },
      select: { connected_accounts: true },
    });

    const connectedAccounts = workspace?.connected_accounts.includes('meta')
      ? workspace.connected_accounts
      : [...(workspace?.connected_accounts ?? []), 'meta'];

    let upsertResults: unknown[];
    try {
      upsertResults = await this.prisma.$transaction([
        this.prisma.workspace.update({
          where: { workspace_id: workspaceId },
          data: { connected_accounts: connectedAccounts },
        }),
        this.prisma.metaConnection.upsert({
          where: { workspace_id: workspaceId },
          create: {
            workspace_id: workspaceId,
            linked_by_id: userId,
            user_access_token: this.cipher.encrypt(longLivedToken.access_token),
            user_access_token_expires_at: userAccessTokenExpiresAt,
          },
          update: {
            linked_by_id: userId,
            user_access_token: this.cipher.encrypt(longLivedToken.access_token),
            user_access_token_expires_at: userAccessTokenExpiresAt,
          },
        }),
        ...fetchedPages.map((page) =>
          this.prisma.facebookPage.upsert({
            where: { page_id: page.page_id },
            create: {
              workspace_id: workspaceId,
              page_id: page.page_id,
              page_name: page.page_name,
              page_access_token: this.cipher.encrypt(page.page_access_token),
              instagram_account_id:
                page.instagram_account?.instagram_account_id,
              instagram_username: page.instagram_account?.username,
              instagram_name: page.instagram_account?.name,
              instagram_profile_picture_url:
                page.instagram_account?.profile_picture_url,
            },
            update: {
              workspace_id: workspaceId,
              page_name: page.page_name,
              page_access_token: this.cipher.encrypt(page.page_access_token),
              instagram_account_id:
                page.instagram_account?.instagram_account_id,
              instagram_username: page.instagram_account?.username,
              instagram_name: page.instagram_account?.name,
              instagram_profile_picture_url:
                page.instagram_account?.profile_picture_url,
            },
          }),
        ),
      ]);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(
          'One of these Facebook Pages or Instagram accounts is already linked to another workspace',
        );
      }
      throw error;
    }

    const upsertedPages = upsertResults.slice(2) as FacebookPage[];

    return {
      workspace_id: workspaceId,
      pages: fetchedPages.map((page, index) => ({
        facebook_page_id: upsertedPages[index].id,
        page_id: page.page_id,
        page_name: page.page_name,
        instagram_account: page.instagram_account,
        updated_at: new Date(),
      })),
    };
  }

  private toWorkspaceLinkedPage(page: {
    id: number;
    page_id: string;
    page_name: string;
    instagram_account_id: string | null;
    instagram_username: string | null;
    instagram_name: string | null;
    instagram_profile_picture_url: string | null;
    updated_at: Date;
  }): WorkspaceLinkedPage {
    return {
      facebook_page_id: page.id,
      page_id: page.page_id,
      page_name: page.page_name,
      instagram_account: page.instagram_account_id
        ? {
            instagram_account_id: page.instagram_account_id,
            username: page.instagram_username ?? '',
            name: page.instagram_name ?? undefined,
            profile_picture_url:
              page.instagram_profile_picture_url ?? undefined,
          }
        : null,
      updated_at: page.updated_at,
    };
  }

  private async verifyState(state: string): Promise<MetaStatePayload> {
    try {
      return await this.jwtService.verifyAsync<MetaStatePayload>(state, {
        secret: this.stateSecret,
        audience: STATE_AUDIENCE,
      });
    } catch {
      throw new BadRequestException('Invalid or expired OAuth state');
    }
  }

  private async exchangeCodeForToken(code: string): Promise<MetaTokenResponse> {
    const url = new URL(
      `https://graph.facebook.com/${this.graphVersion}/oauth/access_token`,
    );
    url.searchParams.set('client_id', this.appId);
    url.searchParams.set('client_secret', this.appSecret);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('code', code);

    return this.request<MetaTokenResponse>(url);
  }

  private async exchangeForLongLivedToken(
    shortLivedToken: string,
  ): Promise<MetaTokenResponse> {
    const url = new URL(
      `https://graph.facebook.com/${this.graphVersion}/oauth/access_token`,
    );
    url.searchParams.set('grant_type', 'fb_exchange_token');
    url.searchParams.set('client_id', this.appId);
    url.searchParams.set('client_secret', this.appSecret);
    url.searchParams.set('fb_exchange_token', shortLivedToken);

    return this.request<MetaTokenResponse>(url);
  }

  private async fetchPages(userAccessToken: string): Promise<FetchedPage[]> {
    const pagesUrl = new URL(
      `https://graph.facebook.com/${this.graphVersion}/me/accounts`,
    );
    pagesUrl.searchParams.set(
      'fields',
      'id,name,access_token,instagram_business_account',
    );
    pagesUrl.searchParams.set('access_token', userAccessToken);

    const pages = await this.request<MetaPagesResponse>(pagesUrl);

    return Promise.all(
      pages.data.map(async (page) => {
        const instagramAccount = page.instagram_business_account
          ? await this.getInstagramBusinessAccount(
              page.instagram_business_account.id,
              page.access_token,
            )
          : null;

        return {
          page_id: page.id,
          page_name: page.name,
          page_access_token: page.access_token,
          instagram_account: instagramAccount,
        };
      }),
    );
  }

  private async getInstagramBusinessAccount(
    instagramAccountId: string,
    pageAccessToken: string,
  ) {
    const igUrl = new URL(
      `https://graph.facebook.com/${this.graphVersion}/${instagramAccountId}`,
    );
    igUrl.searchParams.set('fields', 'id,username,name,profile_picture_url');
    igUrl.searchParams.set('access_token', pageAccessToken);

    const igAccount = await this.request<MetaInstagramBusinessAccount>(igUrl);

    return {
      instagram_account_id: igAccount.id,
      username: igAccount.username,
      name: igAccount.name,
      profile_picture_url: igAccount.profile_picture_url,
    };
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

  private get appId(): string {
    return this.getRequiredConfig('META_APP_ID');
  }

  private get appSecret(): string {
    return this.getRequiredConfig('META_APP_SECRET');
  }

  private get redirectUri(): string {
    return this.getRequiredConfig('META_REDIRECT_URI');
  }

  private get stateSecret(): string {
    return this.getRequiredConfig('META_OAUTH_STATE_SECRET');
  }

  private get graphVersion(): string {
    return (
      this.configService.get<string>('META_GRAPH_API_VERSION') ??
      DEFAULT_GRAPH_API_VERSION
    );
  }

  private get scopes(): string {
    return (
      this.configService.get<string>('META_OAUTH_SCOPES') ?? DEFAULT_SCOPES
    );
  }

  private get cipher(): TokenCipher {
    return TokenCipher.fromBase64(
      this.getRequiredConfig('TOKEN_ENCRYPTION_KEY'),
    );
  }

  private getRequiredConfig(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new Error(`${key} is not configured`);
    }
    return value;
  }
}
