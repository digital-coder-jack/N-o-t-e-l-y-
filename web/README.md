# AI Notebook — Premium Sidebar (Next.js)

A production-ready, premium sidebar system for the AI Notebook workspace.
Built with **Next.js 14 · React 18 · TypeScript · Tailwind CSS · Framer Motion · Lucide React**.

## ✨ Features

### Desktop Sidebar
- **280px expanded ↔ 72px collapsed** with a smooth 300ms width animation (`Ctrl+B`)
- Rounded floating container with subtle glassmorphism, soft shadows and ambient blue/purple glow
- Logo always visible; labels fade out smoothly when collapsed; icons center-aligned
- **Sliding active indicator** (Framer Motion shared layout) + left accent bar
- Hover: scale 1.03, icon micro-rotation, soft glow; **ripple click animation**
- Tooltips with keyboard shortcuts when collapsed
- Thin custom scrollbar

### Mobile Drawer
- Slide-in drawer from left — **85% width, max 320px**
- **Swipe right from screen edge to open, swipe/drag left to close**
- Blurred overlay; tap-outside closes; floating bottom-left hamburger (thumb-friendly)
- **Safe-area insets** for notched phones (`viewport-fit=cover`)
- Body scroll locking + focus management

### Navigation
- Sections: **Workspace · AI Studio · Productivity · Learning · Community · Tools · System**
- Dedicated AI section with subtle purple glow on icons
- Badges: counts, `NEW`, `AI`, `Syncing`, `Error`
- Right-click **context menu** on notebooks (Rename / Duplicate / Move / Share / Export / Delete)
- Logout always pinned to bottom

### Command Palette (`Ctrl+K`)
- Search notes, notebooks, AI history and commands
- Recent-search chips, full arrow-key navigation, `↵` to open

### Header & Profile
- Logo + current workspace + sync status (synced / syncing / offline / error)
- Search button + gradient New Note button
- User profile card: avatar, name, email, plan chip, sync dot, **animated storage bar**, expandable menu (Profile / Account / Subscription / Settings / Logout)

### Footer
- Cloud sync status · online indicator · version

### Accessibility & Quality
- Full keyboard navigation, ARIA labels/roles, visible focus rings
- ≥44px touch targets, `prefers-reduced-motion` support
- **Dark mode first** with a full light theme (toggle on dashboard)
- Sidebar state (collapsed / active item / theme) **persisted to localStorage**
- GPU-friendly transform/opacity animations — no layout shift

## 🚀 Getting Started

```bash
cd web
npm install
npm run dev      # http://localhost:3000
npm run build && npm start   # production
```

## 📁 Structure

```
web/
├── app/                    # Next.js app router (layout, page, globals.css, icon)
├── components/
│   ├── sidebar/            # AppShell, SidebarProvider, DesktopSidebar,
│   │                       # MobileDrawer, SidebarContent, SidebarHeader,
│   │                       # NavItemButton, NavSectionGroup, UserProfileCard,
│   │                       # SidebarFooter, CommandPalette, ContextMenu
│   └── ui/                 # Badge, Tooltip primitives
├── hooks/                  # useMediaQuery, useSwipe
└── lib/                    # types, navigation config, utils
```

## 🔌 Usage in your app

```tsx
import { AppShell } from "@/components/sidebar";

export default function Page() {
  return (
    <AppShell>
      <YourContent />
    </AppShell>
  );
}
```

Edit `lib/navigation.ts` to change sections, items, icons, badges and shortcuts.

## ⌨️ Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl/⌘ + K` | Command palette |
| `Ctrl/⌘ + B` | Toggle sidebar / drawer |
| `Esc` | Close palette / drawer |
| `↑ ↓ ↵` | Navigate palette results |
