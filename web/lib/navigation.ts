import {
  BookOpen,
  CalendarDays,
  CheckSquare,
  FileText,
  FolderKanban,
  Gauge,
  Lightbulb,
  NotebookPen,
  Settings,
  Sparkles,
  StickyNote,
  Target,
  Wrench,
} from "lucide-react";
import type { NavItem, NavSection } from "./types";

export const ALL_SECTIONS: NavSection[] = [
  {
    id: "workspace",
    title: "Workspace",
    items: [
      { id: "dashboard", label: "Dashboard", icon: Gauge, shortcut: "G" },
      { id: "notebooks", label: "Notebooks", icon: BookOpen, contextMenu: true },
      { id: "notes", label: "Notes", icon: StickyNote, contextMenu: true },
      { id: "tasks", label: "Tasks", icon: CheckSquare },
      { id: "planner", label: "Planner", icon: CalendarDays },
    ],
  },
  {
    id: "ai",
    title: "AI tools",
    items: [
      { id: "flashcards", label: "Flashcards", icon: NotebookPen },
      { id: "quizzes", label: "Quizzes", icon: Lightbulb },
    ],
  },
  {
    id: "resources",
    title: "Resources",
    items: [
      { id: "files", label: "Files", icon: FolderKanban },
      { id: "reports", label: "Reports", icon: FileText },
      { id: "goals", label: "Goals", icon: Target },
      { id: "tools", label: "Tools", icon: Wrench, badge: { label: "New", variant: "new" } },
    ],
  },
];

export const BOTTOM_SECTION: NavSection = {
  id: "settings",
  items: [{ id: "settings", label: "Settings", icon: Settings }],
};

export const ALL_ITEMS: NavItem[] = [
  ...ALL_SECTIONS.flatMap((section) => section.items),
  ...BOTTOM_SECTION.items,
];

export function getNavItem(id: string): NavItem | undefined {
  return ALL_ITEMS.find((item) => item.id === id);
}

export { Sparkles };
