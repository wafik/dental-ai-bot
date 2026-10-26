import { redirect } from "next/navigation";
import { readAdminSession } from "@/services/admin-session-server";
import { AdminLoginForm } from "@/components/admin/admin-login-form";

// The redirect for an already-signed-in admin depends on the request cookie.
export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  const session = await readAdminSession();
  if (session) {
    redirect("/admin");
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold tracking-tight">Admin sign in</h1>
          <p className="text-sm text-muted-foreground">
            Use the clinic administrator account to manage calendar providers and credentials.
          </p>
        </div>
        <AdminLoginForm />
      </div>
    </div>
  );
}
