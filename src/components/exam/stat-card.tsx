import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

const TONES = {
  primary: "from-primary to-primary-glow text-primary-foreground",
  cyan: "from-[oklch(0.7_0.16_210)] to-[oklch(0.75_0.18_190)] text-primary-foreground",
  sunset: "from-[oklch(0.72_0.19_40)] to-[oklch(0.68_0.24_15)] text-primary-foreground",
  success: "from-[oklch(0.66_0.17_155)] to-[oklch(0.72_0.16_175)] text-primary-foreground",
  violet: "from-[oklch(0.62_0.24_305)] to-[oklch(0.58_0.22_265)] text-primary-foreground",
} as const;

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "primary",
  delay = 0,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  tone?: keyof typeof TONES;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      whileHover={{ y: -4 }}
    >
      <Card
        className={`relative h-full min-w-0 overflow-hidden border-none bg-gradient-to-br p-5 shadow-elegant ${TONES[tone]}`}
      >
        <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/15 blur-2xl" />
        <div className="relative">
          <div className="flex items-center gap-2 opacity-85">
            <Icon className="h-4 w-4" />
            <span className="text-[11px] font-medium uppercase tracking-wider">{label}</span>
          </div>
          <div className="mt-2 truncate font-display text-3xl font-bold">{value}</div>
          {hint && <p className="mt-1 truncate text-xs opacity-80">{hint}</p>}
        </div>
      </Card>
    </motion.div>
  );
}
