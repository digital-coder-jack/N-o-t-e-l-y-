import type { LucideIcon } from "lucide-react";

export type NavBadgeVariant = "count" | "new" | "ai" | "syncing" | "error" | "beta";

export interface NavBadge {
  label: string;
  variant: NavBadgeVariant;
}

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  badge?: NavBadge;
  aiGlow?: boolean;
  contextMenu?: boolean;
}

export interface NavSection {
  id: string;
  title?: string;
  items: NavItem[];
}

export type SyncStatus = "synced" | "syncing" | "error" | "offline";

export interface UserProfile {
  name: string;
  email: string;
  initials: string;
  plan: string;
  syncStatus: SyncStatus;
  storageUsedGB: number;
  storageTotalGB: number;
}
