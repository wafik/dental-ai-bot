import { redirect } from "next/navigation";
import { readAdminSession } from "@/services/admin-session-server";
import { AdminSettingsForm } from "@/components/admin/admin-settings-form";

// The session cookie must be read per request; prerendering this page would
// bake the unauthenticated redirect into the build output.
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await readAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b bg-card shadow-xs">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h1 className="text-xl font-bold tracking-tight">BrightSmile Admin</h1>
            <p className="text-xs text-muted-foreground">
              Signed in as <span className="font-medium text-foreground">{session.username}</span>
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto w-full flex-1 px-4 sm:px-6 py-8">
        <AdminSettingsForm username={session.username} />
      </main>
    </div>
  );
}
