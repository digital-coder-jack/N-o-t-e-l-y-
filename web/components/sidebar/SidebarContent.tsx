"use client";

import React, { useState, useCallback } from "react";
import type { NavItem, UserProfile } from "@/lib/types";
import { ALL_SECTIONS, BOTTOM_SECTION } from "@/lib/navigation";
import { NavSectionGroup } from "./NavSectionGroup";
import { SidebarHeader } from "./SidebarHeader";
import { UserProfileCard } from "./UserProfileCard";
import { SidebarFooter } from "./SidebarFooter";
import { ContextMenu, type ContextMenuState } from "./ContextMenu";
import { NavItemButton } from "./NavItemButton";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/Tooltip";

const DEMO_USER: UserProfile = {
  name: "Aarav Sharma",
  email: "aarav@ainotebook.app",
  initials: "AS",
  plan: "Pro",
  syncStatus: "synced",
  storageUsedGB: 3.2,
  storageTotalGB: 10,
};

interface SidebarContentProps {
  collapsed: boolean;
  onNavigate?: () => void;
  showCollapseToggle?: boolean;
}

/**
 * Shared sidebar body used by both the desktop sidebar and the mobile drawer.
 */
export function SidebarContent({
  collapsed,
  onNavigate,
  showCollapseToggle = true,
}: SidebarContentProps) {
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);

  const handleLogout = () => {
    window.localStorage.removeItem("ss_token");
    window.localStorage.removeItem("ss_user");
    window.location.assign("/login");
  };

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, item: NavItem) => {
      e.preventDefault();
      setCtxMenu({ x: e.clientX, y: e.clientY, item });
    },
    []
  );

  return (
    <div className="flex h-full flex-col">
      <SidebarHeader
        collapsed={collapsed}
        workspace="My Workspace"
        syncStatus={DEMO_USER.syncStatus}
        showCollapseToggle={showCollapseToggle}
      />

      {/* Scrollable navigation */}
      <nav
        aria-label="Main navigation"
        className="sidebar-scroll mt-1 min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-3"
      >
        {ALL_SECTIONS.map((section) => (
          <NavSectionGroup
            key={section.id}
            section={section}
            collapsed={collapsed}
            onNavigate={onNavigate}
            onContextMenu={handleContextMenu}
          />
        ))}

        {/* System / bottom section */}
        <NavSectionGroup
          section={BOTTOM_SECTION}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      </nav>

      {/* Pinned bottom area */}
      <div className="shrink-0 border-t border-line/50 pt-2">
        {/* Logout — always pinned */}
        <div className="px-2 pb-1">
          <Tooltip label="Logout" disabled={!collapsed}>
            <button
              type="button"
              aria-label="Logout"
              onClick={handleLogout}
              className={cn(
                "group flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 text-[13px] font-medium text-ink-muted",
                "transition-colors duration-200 hover:bg-red-500/10 hover:text-red-400",
                collapsed && "justify-center px-0"
              )}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center">
                <LogOut
                  className="h-[18px] w-[18px] transition-transform duration-300 group-hover:translate-x-0.5"
                  strokeWidth={1.8}
                  aria-hidden
                />
              </span>
              {!collapsed && <span>Logout</span>}
            </button>
          </Tooltip>
        </div>

        <UserProfileCard user={DEMO_USER} collapsed={collapsed} />
        <SidebarFooter collapsed={collapsed} />
      </div>

      <ContextMenu state={ctxMenu} onClose={() => setCtxMenu(null)} />
    </div>
  );
}
