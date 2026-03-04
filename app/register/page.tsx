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
      const { data } = await supabase.from("users").select("full_name").eq("auth_id", session.user.id).single();
      const name = ((data as { full_name?: string } | null)?.full_name ?? "").toLowerCase().trim();
      setIsAdmin(name === "mughis siddiqui");
      setChecking(false);
    })();
  }, [router]);

  if (checking) return null;

  return <Register isAdmin={isAdmin} />;
}
