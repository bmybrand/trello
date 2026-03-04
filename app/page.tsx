"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCachedSession, getSessionWithRetry } from "@/lib/supabase";
import Register from "../components/Register";

export default function Home() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    (async () => {
      const session = await getSessionWithRetry(400);
      if (session?.user) {
        router.replace("/dashboard");
      } else {
        setChecking(false);
      }
    })();
  }, [router]);

  if (checking) {
    return null;
  }

  return <Register />;
}
