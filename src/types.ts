export interface Asset {
  id: string;
  project_id: string;
  kind: "button" | "thanks";
  mime: string;
  size: number;
  name: string;
  created_at: string;
}
export interface Project {
  id: string;
  title: string;
  slug: string;
  description: string;
  site_url: string;
  allowed_origins: string[];
  clap_enabled: boolean | number;
  message_enabled: boolean | number;
  favorite_enabled: boolean | number;
  thanks_mode: "fixed" | "random";
  tip_url: string | null;
  tip_legal_checked: boolean | number;
  tip_terms_checked: boolean | number;
  tip_privacy_checked: boolean | number;
  claps: number;
  messages: number;
  assets?: Asset[];
  turnstile_site_key?: string | null;
}
export interface Message {
  id: string;
  project_id: string;
  project_title: string;
  body: string;
  created_at: string;
  read_at: string | null;
  publication_consent: number;
  blocked: number;
  reply_body: string | null;
  replied_at: string | null;
  reply_link_active?: number;
}
export interface Stats {
  claps: { day: string; count: number }[];
  messages: { day: string; count: number }[];
  totals: { total: number; unread: number; unreplied: number };
  from: string;
  to: string;
}
