import { useEffect, useState } from "react";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  CalendarCheck,
  ChevronDown,
  ClipboardList,
  Download,
  GraduationCap,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Moon,
  MousePointerClick,
  Settings as SettingsIcon,
  Smartphone,
  Sun,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useTheme } from "@/hooks/use-theme";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { logoutLocal } from "@/lib/auth";
import { BrandName } from "@/components/brand";

const SCHOLARS_KEY = "scholaris:scholars-menu-open";

const SCHOLARS_ITEMS = [
  { to: "/", label: "Student Management", icon: Users, match: (p: string) => p === "/" || p.startsWith("/schools") },
  { to: "/exam-report", label: "Exam Report", icon: BarChart3, match: (p: string) => p.startsWith("/exam-report") },
  { to: "/assessments", label: "Assessment Master", icon: ClipboardList, match: (p: string) => p.startsWith("/assessments") },
  { to: "/questions", label: "Question Master", icon: HelpCircle, match: (p: string) => p.startsWith("/questions") },
  { to: "/clicker", label: "Clicker Data", icon: MousePointerClick, match: (p: string) => p.startsWith("/clicker") },
] as const;

/**
 * Single source of truth for app navigation. Replaces the old header dropdown:
 * one collapsible "Scholars" group plus the top-level modules, with the open
 * state remembered in localStorage and the active route highlighted.
 */
export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const { setOpenMobile, isMobile } = useSidebar();
  const { installed, canInstall, isIos, promptInstall } = usePwaInstall();
  const [scholarsOpen, setScholarsOpen] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(SCHOLARS_KEY);
    if (saved !== null) setScholarsOpen(saved === "1");
  }, []);

  const toggleScholars = () =>
    setScholarsOpen((v) => {
      localStorage.setItem(SCHOLARS_KEY, v ? "0" : "1");
      return !v;
    });

  const close = () => {
    if (isMobile) setOpenMobile(false);
  };

  const signOut = () => {
    close();
    logoutLocal();
    toast.success("Signed out");
    router.navigate({ to: "/login", replace: true });
  };

  const scholarsActive = SCHOLARS_ITEMS.some((i) => i.match(pathname));

  const install = async () => {
    if (canInstall) {
      const ok = await promptInstall();
      if (ok) toast.success("Installing SchoolRise...");
      return;
    }
    toast.info(
      isIos
        ? "On iPhone: tap Share, then 'Add to Home Screen' to install SchoolRise."
        : "To install SchoolRise, use your browser's 'Add to Home Screen' option.",
    );
  };

  return (
    <Sidebar collapsible="offcanvas" className="border-r border-sidebar-border">
      <SidebarHeader className="p-3">
        <Link to="/" onClick={close} className="flex min-w-0 items-center gap-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-elegant">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div className="flex min-w-0 flex-col leading-none">
            <BrandName className="truncate font-display text-lg font-bold tracking-tight" />
            <span className="truncate text-[10px] uppercase tracking-widest text-muted-foreground">
              School Manager
            </span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Overview</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/"} tooltip="Dashboard">
                  <Link to="/" onClick={close}>
                    <LayoutDashboard />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={toggleScholars}
                  isActive={scholarsActive && !scholarsOpen}
                  aria-expanded={scholarsOpen}
                >
                  <Users />
                  <span>Scholars</span>
                  <ChevronDown
                    className={`ml-auto transition-transform duration-200 ${scholarsOpen ? "rotate-180" : ""}`}
                  />
                </SidebarMenuButton>
                <div
                  className={`grid transition-all duration-200 ease-out ${
                    scholarsOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <SidebarMenuSub>
                      {SCHOLARS_ITEMS.map((item) => (
                        <SidebarMenuSubItem key={item.label}>
                          <SidebarMenuSubButton asChild isActive={item.match(pathname)}>
                            <Link to={item.to} onClick={close}>
                              <item.icon />
                              <span>{item.label}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </div>
                </div>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith("/session-status")}
                  tooltip="Session Status"
                >
                  <Link to="/session-status" onClick={close}>
                    <CalendarCheck />
                    <span>Session Status</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname.startsWith("/settings")} tooltip="Settings">
                  <Link to="/settings" onClick={close}>
                    <SettingsIcon />
                    <span>Settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-1 p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={installed ? undefined : install} disabled={installed}>
              {installed ? <Smartphone /> : <Download />}
              <span>{installed ? "SchoolRise installed" : "Install SchoolRise"}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={toggle}>
              {theme === "dark" ? <Sun /> : <Moon />}
              <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut}>
              <LogOut />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
