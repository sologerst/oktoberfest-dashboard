import { headers } from "next/headers";
import { SalesDashboard } from "@/components/sales-dashboard";
import { isDashboardRequestAuthorized } from "@/lib/auth";
import { loadScreenSnapshot } from "@/lib/screen";

export const dynamic = "force-dynamic";

export default async function Page() {
  const headerStore = await headers();
  if (!isDashboardRequestAuthorized(headerStore.get("authorization"))) {
    return (
      <main className="grid min-h-screen place-items-center bg-page px-6">
        <p className="text-sm text-white/55">Sign in required.</p>
      </main>
    );
  }

  const screen = await loadScreenSnapshot();
  return <SalesDashboard initial={screen.snapshot} sample={screen.sample} />;
}
