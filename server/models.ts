export interface Project {
  id: string;
  owner_id: string;
  title: string;
  slug: string;
  description: string;
  site_url: string;
  allowed_origins: string;
  clap_enabled: number;
  message_enabled: number;
  favorite_enabled: number;
  thanks_enabled: number;
  reply_enabled: number;
  tip_enabled: number;
  thanks_mode: "fixed" | "random";
  tip_url: string;
  tip_legal_checked: number;
  tip_terms_checked: number;
  tip_privacy_checked: number;
  created_at: string;
}
export interface Message {
  id: string;
  project_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
  publication_consent: number;
  reply_token_hash: string | null;
  dedupe_key: string;
  blocked: number;
}
export interface Asset {
  id: string;
  project_id: string;
  kind: "button" | "thanks";
  storage_key: string;
  mime: string;
  size: number;
  name: string;
  created_at: string;
}
