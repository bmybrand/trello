"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, getSessionWithRetry } from "@/lib/supabase";
import Register from "@/components/Register";

export default function RegisterPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    (async () => {
      const session = await getSessionWithRetry(400);
      if (!session?.user) {
        router.replace("/");
        return;
      }
      const supabase = createClient();
      const { data } = await supabase.from("users").select("app_role").eq("auth_id", session.user.id).single();
      const appRole = ((data as { app_role?: string | null } | null)?.app_role ?? "").toLowerCase().trim();
      setIsAdmin(appRole === "admin" || appRole === "superadmin");
      setChecking(false);
    })();
  }, [router]);

  if (checking) return null;

  return <Register isAdmin={isAdmin} />;
}
