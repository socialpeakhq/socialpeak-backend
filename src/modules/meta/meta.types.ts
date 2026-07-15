export interface MetaStatePayload {
  sub: number;
  workspace_id: number;
  nonce: string;
}

export interface MetaTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

export interface MetaGraphErrorResponse {
  error: {
    message: string;
    type: string;
    code: number;
    fbtrace_id?: string;
  };
}

export interface MetaPage {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: {
    id: string;
  };
}

export interface MetaPagesResponse {
  data: MetaPage[];
}

export interface MetaInstagramBusinessAccount {
  id: string;
  username: string;
  name?: string;
  profile_picture_url?: string;
}

export interface LinkedInstagramAccount {
  instagram_account_id: string;
  username: string;
  name?: string;
  profile_picture_url?: string;
}

export interface FetchedPage {
  page_id: string;
  page_name: string;
  page_access_token: string;
  instagram_account: LinkedInstagramAccount | null;
}

export interface WorkspaceLinkedPage {
  page_id: string;
  page_name: string;
  instagram_account: LinkedInstagramAccount | null;
  updated_at: Date;
}

export interface MetaLinkResult {
  workspace_id: number;
  pages: WorkspaceLinkedPage[];
}

export interface MetaCallbackQuery {
  code?: string;
  state?: string;
  error?: string;
  error_reason?: string;
  error_description?: string;
}

export interface MetaPopupMessage {
  linked: boolean;
  workspace_id?: number;
  pages?: WorkspaceLinkedPage[];
  error?: string;
  error_description?: string;
}

export type MetaInsightsData = {
  name: string;
  period: string;
  title: string;
  description: string;
  total_value?: {
    value: number;
  };
  values?: {
    value: number;
    end_time: string;
  }[];
  id: string;
};

export type MetaInsightsResponse = {
  data: MetaInsightsData[];
  paging: {
    next: string;
    previous: string;
  };
};
