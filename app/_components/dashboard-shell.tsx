import Link from "next/link";
import type { MemberRole } from "@prisma/client";
import type { ReactNode } from "react";
import { ROLE_LABEL } from "@/app/_lib/access";
import type { PlatformState } from "@/app/_lib/billing";
import { formatDate } from "@/app/_lib/format";

type NavKey =
  | "overview"
  | "agenda"
  | "services"
  | "professionals"
  | "team"
  | "plans"
  | "subscribers"
  | "finance"
  | "settings"
  | "billing";

const NAV: Array<{
  key: NavKey;
  label: string;
  path: string;
  roles: MemberRole[];
}> = [
  {
    key: "overview",
    label: "Visão geral",
    path: "",
    roles: ["OWNER", "MANAGER", "RECEPTIONIST", "BARBER"],
  },
  {
    key: "agenda",
    label: "Agenda",
    path: "/agenda",
    roles: ["OWNER", "MANAGER", "RECEPTIONIST", "BARBER"],
  },
  {
    key: "subscribers",
    label: "Assinantes",
    path: "/subscribers",
    roles: ["OWNER", "MANAGER", "RECEPTIONIST"],
  },
  {
    key: "plans",
    label: "Planos",
    path: "/plans",
    roles: ["OWNER", "MANAGER"],
  },
  {
    key: "services",
    label: "Serviços",
    path: "/services",
    roles: ["OWNER", "MANAGER"],
  },
  {
    key: "professionals",
    label: "Profissionais",
    path: "/professionals",
    roles: ["OWNER", "MANAGER"],
  },
  { key: "team", label: "Acessos", path: "/team", roles: ["OWNER", "MANAGER"] },
  {
    key: "finance",
    label: "Financeiro",
    path: "/finance",
    roles: ["OWNER", "MANAGER"],
  },
  {
    key: "settings",
    label: "Configurações",
    path: "/settings",
    roles: ["OWNER"],
  },
  { key: "billing", label: "Mensalidade", path: "/billing", roles: ["OWNER"] },
];

type Props = {
  barbershop: { id: string; name: string };
  roles: MemberRole[];
  userName: string;
  active: NavKey;
  access: {
    state: PlatformState;
    subscription: { currentPeriodEnd: Date | null };
    graceEndsAt: Date | null;
  };
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function DashboardShell({
  barbershop,
  roles,
  userName,
  active,
  access,
  title,
  description,
  actions,
  children,
}: Props) {
  const base = `/dashboard/${barbershop.id}`;
  const items = NAV.filter((item) =>
    item.roles.some((role) => roles.includes(role)),
  );
  const isOwner = roles.includes("OWNER");
  const mainRole =
    (["OWNER", "MANAGER", "RECEPTIONIST", "BARBER"] as MemberRole[]).find(
      (role) => roles.includes(role),
    ) ?? "BARBER";

  return (
    <main className="min-h-screen">
      <header className="border-b border-white/[0.07]">
        <div className="container-shell flex h-[68px] items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="text-xl font-black tracking-[-0.06em]">
              barber<span className="accent-text">.</span>
            </Link>
            <span className="hidden truncate text-sm text-neutral-500 sm:inline">
              / {barbershop.name}
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/account"
              className="hidden text-neutral-400 hover:text-white sm:inline"
            >
              {userName}
            </Link>
            <form action="/api/auth/logout" method="post">
              <button className="text-neutral-400 transition hover:text-white">
                Sair
              </button>
            </form>
          </div>
        </div>
        <nav
          aria-label="Seções do painel"
          className="container-shell -mb-px flex gap-1 overflow-x-auto pb-0"
        >
          {items.map((item) => (
            <Link
              key={item.key}
              href={`${base}${item.path}`}
              aria-current={item.key === active ? "page" : undefined}
              className={`shrink-0 border-b-2 px-3 py-3 text-sm font-semibold transition ${
                item.key === active
                  ? "border-[#c8f169] text-white"
                  : "border-transparent text-neutral-500 hover:text-neutral-200"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      {access.state === "trial" && isOwner && (
        <div className="border-b border-[#c8f169]/15 bg-[#c8f169]/[0.06]">
          <p className="container-shell py-2.5 text-xs text-[#d8f69c]">
            Período de teste grátis até{" "}
            {formatDate(access.subscription.currentPeriodEnd)}.{" "}
            <Link href={`${base}/billing`} className="font-bold underline">
              Ativar mensalidade
            </Link>
          </p>
        </div>
      )}
      {access.state === "grace" && (
        <div
          role="alert"
          className="border-b border-amber-300/20 bg-amber-300/[0.08]"
        >
          <p className="container-shell py-2.5 text-xs text-amber-100">
            A mensalidade da plataforma está em atraso. A conta será suspensa em{" "}
            {formatDate(access.graceEndsAt)}.{" "}
            {isOwner ? (
              <Link href={`${base}/billing`} className="font-bold underline">
                Regularizar agora
              </Link>
            ) : (
              "Avise o proprietário."
            )}
          </p>
        </div>
      )}

      <section className="container-shell py-8 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.2em] text-[#c8f169] uppercase">
              {ROLE_LABEL[mainRole]}
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">{title}</h1>
            {description && (
              <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
                {description}
              </p>
            )}
          </div>
          {actions}
        </div>
        <div className="mt-8">{children}</div>
      </section>
    </main>
  );
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "success" | "error" | "warning";
  children: ReactNode;
}) {
  const styles = {
    info: "border-white/10 bg-white/[0.03] text-neutral-300",
    success: "border-[#c8f169]/25 bg-[#c8f169]/[0.08] text-[#d8f69c]",
    error: "border-red-400/25 bg-red-400/[0.08] text-red-200",
    warning: "border-amber-300/25 bg-amber-300/[0.08] text-amber-100",
  }[tone];
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-xl border p-3 text-sm leading-6 ${styles}`}
    >
      {children}
    </p>
  );
}

export const inputClass =
  "w-full rounded-xl border border-white/10 bg-[#171717] px-3 py-2.5 text-sm text-white outline-none focus:border-[#c8f169]";
