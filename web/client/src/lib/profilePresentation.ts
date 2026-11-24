export type ArenaHubRole = "CUSTOMER" | "ARENA_OWNER" | "SHOPKEEPER" | "ADMIN";

export type RoleProfileConfig = {
  label: string;
  eyebrow: string;
  title: string;
  accent: string;
  primaryAction: { label: string; route: string };
  secondaryAction: { label: string; route: string };
};

export function getRoleProfileConfig(role: ArenaHubRole): RoleProfileConfig {
  if (role === "ARENA_OWNER") {
    return {
      label: "Arena Owner",
      eyebrow: "VENUE OPERATIONS PROFILE",
      title: "Build your venue\nwith confidence.",
      accent: "OWNER ACCESS",
      primaryAction: { label: "Open owner workspace", route: "/owner/dashboard" },
      secondaryAction: { label: "Manage my arena", route: "/list-your-arena" },
    };
  }
  if (role === "ADMIN") {
    return {
      label: "Administrator",
      eyebrow: "ARENAHUB CONTROL PROFILE",
      title: "Protect the\nplaying field.",
      accent: "DESIGNATED ADMIN",
      primaryAction: { label: "Open verification queue", route: "/admin/dashboard" },
      secondaryAction: { label: "Review approved venues", route: "/arenas" },
    };
  }
  if (role === "SHOPKEEPER") {
    return {
      label: "Shopkeeper",
      eyebrow: "STORE OPERATIONS PROFILE",
      title: "Keep the store\nmatch-ready.",
      accent: "SHOPKEEPER ACCESS",
      primaryAction: { label: "Open shopkeeper workspace", route: "/shopkeeper/dashboard" },
      secondaryAction: { label: "Set up Razorpay payments", route: "/payments/setup" },
    };
  }
  return {
    label: "Customer",
    eyebrow: "CUSTOMER PROFILE",
    title: "Every game\nstarts here.",
    accent: "CUSTOMER ACCESS",
    primaryAction: { label: "Explore verified arenas", route: "/arenas" },
    secondaryAction: { label: "View my bookings", route: "/my-bookings" },
  };
}

export function formatProfileDate(value?: string | null) {
  if (!value) return "Recently joined";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently joined";
  return `Member since ${new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric" }).format(date)}`;
}
