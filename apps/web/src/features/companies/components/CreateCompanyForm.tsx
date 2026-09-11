"use client";

import {
  useActionState,
} from "react";

import {
  createCompanyAction,
  type CreateCompanyState,
} from "../application/create-company";

const initialState:
  CreateCompanyState = {};

export function CreateCompanyForm() {

  const [
    state,
    formAction,
    pending,
  ] = useActionState(
    createCompanyAction,
    initialState
  );

  return (
    <form
      action={formAction}
      className="space-y-5"
    >

      <div>
        <label
          htmlFor="name"
          className="mb-2 block text-sm font-bold text-slate-200"
        >
          Nombre de la empresa
        </label>

        <input
          id="name"
          name="name"
          type="text"
          required
          placeholder="Ej: Portezuelo S.A."
          className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3.5 text-white outline-none transition placeholder:text-slate-600 focus:border-sky-500"
        />
      </div>

      <div>
        <label
          htmlFor="description"
          className="mb-2 block text-sm font-bold text-slate-200"
        >
          Descripción
        </label>

        <textarea
          id="description"
          name="description"
          rows={4}
          placeholder="Descripción opcional de la empresa o escenario..."
          className="w-full resize-none rounded-2xl border border-white/10 bg-slate-950 px-4 py-3.5 text-white outline-none transition placeholder:text-slate-600 focus:border-sky-500"
        />
      </div>

      {state.error && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {state.error}
        </div>
      )}

      {state.success && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {state.success}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-2xl bg-white px-5 py-3.5 font-black text-slate-950 transition hover:bg-slate-200 disabled:cursor-wait disabled:opacity-50"
      >
        {pending
          ? "Creando..."
          : "Crear empresa"}
      </button>

    </form>
  );
}