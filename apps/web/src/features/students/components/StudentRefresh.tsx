"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export function StudentRefresh() {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") router.refresh(); };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [router]);
  return <p className="mt-3 text-xs text-slate-400">La información se actualiza cada 15 segundos mientras esta ventana está visible.</p>;
}
