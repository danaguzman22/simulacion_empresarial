"use client";

import { useActionState } from "react";
import {
  createCampaignAction,
  type CreateCampaignState,
} from "../application/create-campaign";

const initialState: CreateCampaignState = {};

export function CreateCampaignForm({ companyId }: { companyId: string }) {
  const [state, formAction, pending] = useActionState(
    createCampaignAction,
    initialState
  );

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="companyId" value={companyId} />

      <div>
        <label htmlFor="campaign-name" className="mb-2 block text-sm font-bold text-slate-200">
          Nombre de la campaña
        </label>
        <input
          id="campaign-name"
          name="name"
          required
          minLength={2}
          placeholder="Ej: Comisión 2026"
          className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3.5 text-white outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
        />
      </div>

      <div>
        <label htmlFor="campaign-description" className="mb-2 block text-sm font-bold text-slate-200">
          Descripción
        </label>
        <textarea
          id="campaign-description"
          name="description"
          rows={3}
          placeholder="Descripción opcional..."
          className="w-full resize-none rounded-2xl border border-white/10 bg-slate-950 px-4 py-3.5 text-white outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
        />
      </div>

      {state.error && (
        <p role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          {state.success}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-2xl bg-white px-5 py-3.5 font-black text-slate-950 transition hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-400 disabled:cursor-wait disabled:opacity-50"
      >
        {pending ? "Creando..." : "Crear campaña"}
      </button>
    </form>
  );
}
