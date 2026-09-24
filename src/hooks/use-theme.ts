import { useEffect, useState } from "react";

type Theme = "light" | "dark";
export type ThemeColor = "indigo" | "emerald" | "rose" | "amber" | "cyan" | "violet";

const themeColors: ThemeColor[] = ["indigo", "emerald", "rose", "amber", "cyan", "violet"];

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("light");
  const [color, setColor] = useState<ThemeColor>("indigo");

  useEffect(() => {
    const saved = (localStorage.getItem("theme") as Theme | null) ?? "light";
    const savedColor = localStorage.getItem("theme-color") as ThemeColor | null;
    setTheme(saved);
    if (savedColor && themeColors.includes(savedColor)) setColor(savedColor);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    themeColors.forEach((name) => document.documentElement.classList.remove(`theme-${name}`));
    document.documentElement.classList.add(`theme-${color}`);
    localStorage.setItem("theme-color", color);
  }, [color]);

  return {
    theme,
    setTheme,
    color,
    setColor,
    toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
  };
}
