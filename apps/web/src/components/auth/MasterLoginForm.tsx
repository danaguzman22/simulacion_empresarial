"use client";

import {
  useActionState,
} from "react";

import {
  signInMaster,
  type SignInMasterState,
} from "@/features/auth/application/sign-in-master";

const initialState: SignInMasterState = {};

export function MasterLoginForm() {
  const [
    state,
    formAction,
    pending,
  ] = useActionState(
    signInMaster,
    initialState
  );

  return (
    <form
      action={formAction}
      className="space-y-5"
    >

      <div>
        <label
          htmlFor="email"
          className="mb-2 block text-sm font-bold text-slate-200"
        >
          Email
        </label>

        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="master@ejemplo.com"
          className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-4 text-white outline-none transition placeholder:text-slate-600 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="mb-2 block text-sm font-bold text-slate-200"
        >
          Contraseña
        </label>

        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-4 text-white outline-none transition placeholder:text-slate-600 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
        />
      </div>

      {state.error && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {state.error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-2xl bg-white px-5 py-4 font-black text-slate-950 transition hover:bg-slate-200 disabled:cursor-wait disabled:opacity-60"
      >
        {pending
          ? "Ingresando..."
          : "Ingresar"}
      </button>

    </form>
  );
}