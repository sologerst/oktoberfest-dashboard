import { headers } from "next/headers";
import { PosSetup } from "@/components/pos-setup";
import { isDashboardRequestAuthorized } from "@/lib/auth";
import { loadSetupConfig } from "@/lib/run-refresh";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const headerStore = await headers();
  if (!isDashboardRequestAuthorized(headerStore.get("authorization"))) {
    return (
      <main className="grid min-h-screen place-items-center bg-page px-6">
        <p className="text-sm text-white/55">Sign in required.</p>
      </main>
    );
  }

  const cards = await loadSetupConfig();
  return <PosSetup initial={cards} />;
}
