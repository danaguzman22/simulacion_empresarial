import {
  AccessCard,
} from "@/components/home/AccessCard";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 px-5 py-12 text-white">
      <div className="mx-auto max-w-5xl">

        <header className="mb-12 text-center">
          <p className="text-xs font-black uppercase tracking-[0.4em] text-sky-400">
            Simulación empresarial
          </p>

          <h1 className="mt-4 text-5xl font-black tracking-tight md:text-7xl">
            NEXUS
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-slate-400 md:text-base">
            Plataforma de simulación empresarial
            para toma de decisiones,
            coordinación entre áreas y
            aprendizaje basado en escenarios.
          </p>
        </header>

        <section className="grid gap-5 md:grid-cols-3">

          <AccessCard
            icon="🧭"
            title="Master"
            description="Administrá empresas, campañas, partidas, rondas y participantes."
            href="/login/master"
          />

          <AccessCard
            icon="🎭"
            title="Jugador"
            description="Ingresá a una sala y accedé a la información correspondiente a tu departamento."
            href="/jugador"
            disabled
          />

          <AccessCard
            icon="📺"
            title="Display"
            description="Conectá una pantalla pública a una sala de simulación."
            href="/display"
            disabled
          />

        </section>

        <footer className="mt-16 text-center text-[10px] font-bold uppercase tracking-[0.25em] text-slate-700">
          Plataforma de simulación empresarial
        </footer>

      </div>
    </main>
  );
}