"use client";
import { useActionState, useState } from "react";
import { studentAuth } from "../application/student-auth";
export function StudentLoginForm() {
  const [register, setRegister] = useState(false);
  const [state, action, pending] = useActionState(studentAuth, { message: "" });
  return <div><h1 className="text-3xl font-black">{register ? "Crear cuenta de NEXUS" : "Ingresar a NEXUS"}</h1>
    <form action={action} className="mt-6 space-y-4"><input type="hidden" name="operation" value={register ? "register" : "login"} />
      {register && <label className="block">Nombre<input name="displayName" required maxLength={160} autoComplete="name" className="mt-1 block w-full rounded bg-slate-900 p-3" /></label>}
      <label className="block">Correo<input type="email" name="email" required maxLength={254} autoComplete="email" className="mt-1 block w-full rounded bg-slate-900 p-3" /></label>
      <label className="block">Contraseña<input type="password" name="password" required minLength={register ? 8 : 1} maxLength={256} autoComplete={register ? "new-password" : "current-password"} className="mt-1 block w-full rounded bg-slate-900 p-3" /></label>
      <button disabled={pending} className="w-full rounded bg-sky-700 p-3 disabled:opacity-50">{pending ? "Procesando…" : register ? "Registrarme" : "Iniciar sesión"}</button><p role="status" className="text-sm text-slate-300">{state.message}</p>
    </form><button className="mt-4 text-sky-300" disabled={pending} onClick={() => setRegister(!register)}>{register ? "Ya tengo cuenta: iniciar sesión" : "Crear mi cuenta"}</button>
  </div>;
}
