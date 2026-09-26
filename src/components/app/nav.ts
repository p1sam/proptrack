import {
  BarChart3,
  BookOpen,
  CalendarDays,
  FileText,
  Flag,
  Gauge,
  LayoutDashboard,
  Layers,
  ListOrdered,
  Settings,
  ShieldAlert,
  Target,
  Wallet,
} from "lucide-react";

export const NAV_SECTIONS = [
  { label: null, items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }] },
  {
    label: "Prop firms",
    items: [
      { href: "/accounts", label: "Accounts", icon: Layers },
      { href: "/challenges", label: "Challenges", icon: Target },
      { href: "/payouts", label: "Payouts", icon: Wallet },
      { href: "/rules", label: "Rules", icon: Flag },
    ],
  },
  {
    label: "Trading",
    items: [
      { href: "/trades", label: "Trades", icon: ListOrdered },
      { href: "/journal", label: "Journal", icon: BookOpen },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
    ],
  },
  {
    label: "Analysis",
    items: [
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/strategies", label: "Strategies", icon: Gauge },
      { href: "/risk", label: "Risk & discipline", icon: ShieldAlert },
      { href: "/reports", label: "Reports", icon: FileText },
    ],
  },
  { label: null, items: [{ href: "/settings", label: "Settings", icon: Settings }] },
] as const;
