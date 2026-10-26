"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, PenLine, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "./SidebarProvider";
import type { SyncStatus } from "@/lib/types";

const SYNC_META: Record<SyncStatus, { dot: string; label: string }> = {
  synced: { dot: "bg-emerald-400", label: "Synced" },
  syncing: { dot: "bg-accent-cyan", label: "Syncing…" },
  error: { dot: "bg-red-500", label: "Sync Error" },
  offline: { dot: "bg-ink-faint", label: "Offline" },
};

interface SidebarHeaderProps {
  collapsed: boolean;
  workspace: string;
  syncStatus: SyncStatus;
  showCollapseToggle?: boolean;
}

export function SidebarHeader({
  collapsed,
  workspace,
  syncStatus,
  showCollapseToggle = true,
}: SidebarHeaderProps) {
  const { toggleCollapsed, setPaletteOpen } = useSidebar();
  const sync = SYNC_META[syncStatus];

  return (
    <header className={cn("shrink-0 px-3 pt-4", collapsed && "px-2")}>
      {/* Logo row */}
      <div
        className={cn(
          "flex items-center gap-2.5",
          collapsed && "flex-col gap-3"
        )}
      >
        <div className="relative grid h-10 w-10 shrink-0 place-items-center" aria-hidden>
          <img src="/icon.png" alt="" className="h-full w-full object-contain" />
        </div>

        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.2 }}
              className="min-w-0 flex-1"
            >
              <h1 className="truncate text-[15px] font-bold tracking-tight text-ink">
                AI Notebook
              </h1>
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[11px] font-medium text-ink-faint">
                  {workspace}
                </span>
                <span className="text-ink-faint/50" aria-hidden>
                  ·
                </span>
                <span
                  className="flex items-center gap-1 text-[11px] font-medium text-ink-muted"
                  role="status"
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full animate-pulse-dot",
                      sync.dot
                    )}
                    aria-hidden
                  />
                  {sync.label}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {showCollapseToggle && !collapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Collapse sidebar"
            title="Collapse (Ctrl+B)"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-line/50 hover:text-ink"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Collapsed: expand toggle under logo */}
      {showCollapseToggle && collapsed && (
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label="Expand sidebar"
          title="Expand (Ctrl+B)"
          className="mx-auto mt-3 grid h-8 w-8 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-line/50 hover:text-ink"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      )}

      {/* Search + New Note */}
      <div
        className={cn(
          "mt-4 flex gap-2",
          collapsed ? "flex-col items-center" : "items-stretch"
        )}
      >
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          aria-label="Search (Ctrl+K)"
          className={cn(
            "group flex min-h-[40px] items-center rounded-xl border border-line/70 bg-surface/50 text-ink-faint transition-all duration-200",
            "hover:border-line-strong hover:text-ink-muted hover:shadow-soft-sm",
            collapsed
              ? "h-10 w-10 justify-center"
              : "flex-1 gap-2 px-3 text-[13px]"
          )}
        >
          <Search className="h-4 w-4 shrink-0" aria-hidden />
          {!collapsed && (
            <>
              <span className="flex-1 text-left font-medium">Search</span>
              <kbd className="rounded-md bg-line/60 px-1.5 py-0.5 font-mono text-[10px]">
                ⌘K
              </kbd>
            </>
          )}
        </button>

        <motion.button
          type="button"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.96 }}
          aria-label="New note"
          className={cn(
            "grid min-h-[40px] place-items-center rounded-xl bg-gradient-to-r from-accent-blue to-accent-purple text-white shadow-glow-blue transition-shadow",
            "hover:shadow-glow-ai",
            collapsed ? "h-10 w-10" : "w-10"
          )}
        >
          <PenLine className="h-4 w-4" aria-hidden />
        </motion.button>
      </div>
    </header>
  );
}
