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

// Internal representation used while syncing — carries the raw tokens that
// get encrypted and persisted, never returned to the client as-is.
export interface FetchedPage {
  page_id: string;
  page_name: string;
  page_access_token: string;
  instagram_account: LinkedInstagramAccount | null;
}

// What the API returns for a linked account — no raw tokens.
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
