"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronUp,
  User,
  CreditCard,
  Gem,
  Settings,
  LogOut,
} from "lucide-react";
import { cn, formatStorage } from "@/lib/utils";
import type { UserProfile } from "@/lib/types";
import { Tooltip } from "@/components/ui/Tooltip";

const MENU = [
  { id: "profile", label: "Profile", icon: User },
  { id: "account", label: "Account", icon: CreditCard },
  { id: "subscription", label: "Subscription", icon: Gem },
  { id: "settings", label: "Settings", icon: Settings },
] as const;

export function UserProfileCard({
  user,
  collapsed,
}: {
  user: UserProfile;
  collapsed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const storagePct = Math.min(
    100,
    (user.storageUsedGB / user.storageTotalGB) * 100
  );

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const avatar = (
    <div className="relative shrink-0">
      <div
        className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-accent-blue to-accent-purple text-[12px] font-bold text-white ring-2 ring-surface-raised"
        aria-hidden
      >
        {user.initials}
      </div>
      <span
        className={cn(
          "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface-raised",
          user.syncStatus === "synced" && "bg-emerald-400",
          user.syncStatus === "syncing" && "bg-accent-cyan",
          user.syncStatus === "error" && "bg-red-500",
          user.syncStatus === "offline" && "bg-ink-faint"
        )}
        role="status"
        aria-label={`Sync status: ${user.syncStatus}`}
      />
    </div>
  );

  return (
    <div ref={ref} className={cn("relative px-2 pb-2", collapsed && "px-2")}>
      {/* Expandable menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            role="menu"
            aria-label="Account menu"
            className={cn(
              "absolute bottom-full z-[60] mb-2 overflow-hidden rounded-2xl border border-line/70 bg-surface-overlay/95 p-1.5 shadow-soft backdrop-blur-xl",
              collapsed ? "left-full ml-3 w-52 bottom-0" : "left-2 right-2"
            )}
          >
            {MENU.map((m) => (
              <button
                key={m.id}
                type="button"
                role="menuitem"
                className="flex min-h-[40px] w-full items-center gap-2.5 rounded-xl px-3 text-[13px] font-medium text-ink-muted transition-colors hover:bg-line/40 hover:text-ink"
              >
                <m.icon className="h-4 w-4" aria-hidden />
                {m.label}
              </button>
            ))}
            <div className="my-1 h-px bg-line/70" aria-hidden />
            <button
              type="button"
              role="menuitem"
              className="flex min-h-[40px] w-full items-center gap-2.5 rounded-xl px-3 text-[13px] font-medium text-red-400 transition-colors hover:bg-red-500/10"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Logout
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {collapsed ? (
        <Tooltip label={user.name}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={`Account: ${user.name}`}
            aria-expanded={open}
            className="mx-auto grid min-h-[44px] w-full place-items-center rounded-xl transition-colors hover:bg-line/40"
          >
            {avatar}
          </button>
        </Tooltip>
      ) : (
        <motion.button
          type="button"
          onClick={() => setOpen((v) => !v)}
          whileHover={{ scale: 1.015 }}
          whileTap={{ scale: 0.985 }}
          aria-label={`Account: ${user.name}`}
          aria-expanded={open}
          className="w-full rounded-2xl border border-line/60 bg-surface/40 p-3 text-left transition-colors hover:border-line-strong/70 hover:bg-line/20"
        >
          <div className="flex items-center gap-2.5">
            {avatar}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-ink">
                {user.name}
                <span className="ml-1.5 rounded-md bg-accent-purple/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-accent-purple">
                  {user.plan}
                </span>
              </p>
              <p className="truncate text-[11px] text-ink-faint">{user.email}</p>
            </div>
            <ChevronUp
              className={cn(
                "h-4 w-4 shrink-0 text-ink-faint transition-transform duration-200",
                open && "rotate-180"
              )}
              aria-hidden
            />
          </div>

          {/* Storage bar */}
          <div className="mt-2.5">
            <div className="flex items-center justify-between text-[10px] font-medium text-ink-faint">
              <span>Storage</span>
              <span>{formatStorage(user.storageUsedGB, user.storageTotalGB)}</span>
            </div>
            <div
              className="mt-1 h-1.5 overflow-hidden rounded-full bg-line/60"
              role="progressbar"
              aria-valuenow={Math.round(storagePct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Storage used"
            >
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${storagePct}%` }}
                transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
                className="h-full rounded-full bg-gradient-to-r from-accent-blue via-accent-purple to-accent-cyan"
              />
            </div>
          </div>
        </motion.button>
      )}
    </div>
  );
}
