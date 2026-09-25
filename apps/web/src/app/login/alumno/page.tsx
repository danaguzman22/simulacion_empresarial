import Link from "next/link";
import { StudentLoginForm } from "@/features/auth/components/StudentLoginForm";
export default function StudentLoginPage() {
  return <main className="min-h-screen bg-slate-950 px-5 py-12 text-white"><div className="mx-auto max-w-md rounded-3xl border border-white/10 p-6"><Link href="/" className="mb-6 block text-sky-300">NEXUS</Link><StudentLoginForm /></div></main>;
}
