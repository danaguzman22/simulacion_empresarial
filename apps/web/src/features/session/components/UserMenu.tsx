"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { chooseInstitution, signOut } from "../application/session-actions";
import type { SessionArea } from "../domain/session";

type Institution = { id: string; name: string };

// #72 / D-32: user menu. Only the essentials for now: active institution (and changing it when the person belongs
// to more than one), "Mis instituciones" and "Cerrar sesión". Mi perfil and Configuración come later.
export function UserMenu({ area, name, role, active, institutions, nexusAdmin = false }: { area: SessionArea; name: string; role: string; active: Institution | null; institutions: Institution[]; nexusAdmin?: boolean }) {
  const menu = useRef<HTMLDetailsElement>(null);
  // Closes when clicking outside or pressing Escape.
  useEffect(() => {
    const close = (event: Event) => {
      const details = menu.current;
      if (!details?.open) return;
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !details.contains(event.target as Node)) details.open = false;
    };
    document.addEventListener("click", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", close); };
  }, []);
  return <details ref={menu} className="relative text-sm text-slate-200">
    <summary className="cursor-pointer list-none rounded-lg border border-white/15 px-3 py-1.5 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-sky-400">
      <span className="font-semibold text-white">{name}</span> · <span>{role}</span> <span aria-hidden>▾</span>
    </summary>
    <div className="absolute right-0 z-40 mt-2 w-72 space-y-3 rounded-xl border border-white/15 bg-slate-900 p-4 shadow-xl">
      <div>
        <p className="text-xs uppercase tracking-wider text-slate-400">Institución activa</p>
        <p className="font-semibold text-white">{active?.name ?? "Sin institución"}</p>
      </div>
      {institutions.length > 1 && <form action={chooseInstitution} className="space-y-2">
        <input type="hidden" name="area" value={area} />
        <label className="block text-xs uppercase tracking-wider text-slate-400">Cambiar de institución
          <select name="institutionId" defaultValue={active?.id} className="mt-1 w-full rounded-lg bg-slate-800 p-2 text-sm normal-case tracking-normal text-white">
            {institutions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </label>
        <button className="rounded-lg bg-sky-600 px-3 py-1.5 font-semibold text-white hover:bg-sky-500">Cambiar</button>
      </form>}
      <Link href="/instituciones" className="block text-sky-300 hover:underline">Mis instituciones</Link>
      {nexusAdmin && <Link href="/nexus" className="block text-sky-300 hover:underline">Administración de NEXUS</Link>}
      <form action={signOut}><button className="text-sky-300 hover:underline">Cerrar sesión</button></form>
    </div>
  </details>;
}
