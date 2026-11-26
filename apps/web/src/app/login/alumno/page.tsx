import Link from "next/link";
import { backButtonClass } from "@/components/shared/Breadcrumbs";
import { StudentLoginForm } from "@/features/auth/components/StudentLoginForm";
export default function StudentLoginPage() {
  return <main className="min-h-screen bg-slate-950 px-5 py-12 text-white"><div className="mx-auto max-w-md rounded-3xl border border-white/10 p-6"><Link href="/" className={`mb-6 ${backButtonClass}`}>← Volver a la portada</Link><StudentLoginForm /></div></main>;
}
