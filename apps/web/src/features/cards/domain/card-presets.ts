// Sources and classification decisions: docs/FICHAS_V2_FUENTES.md.
// Presets are opt-in form defaults. No migration applies them to existing cards.
import type { ModifierKey } from "./card";
import type { Ability, Weakness, Restriction, CardModifier } from "./card-structure";
export type CardPreset = { id: string; label: string; fields: { name: string; department: string; description: string; visualIdentity: string; publicInformation: string }; responsibilities: string[]; modifiers: Record<ModifierKey, number>; configuredModifiers: CardModifier[]; abilities: Ability[]; weaknesses: Weakness[]; restrictions: Restriction[] };
export const cardPresets: CardPreset[] = [
  {
    "id": "buho",
    "label": "El Búho — Dirección",
    "fields": {
      "name": "Dirección",
      "department": "Dirección",
      "description": "Tiene una mirada global de la empresa. Coordina las áreas, define prioridades y busca que las decisiones individuales estén alineadas con el resultado general.",
      "visualIdentity": "El Búho",
      "publicInformation": "Foco: Resultado global de la empresa · Coordinación entre áreas · Riesgos · Prioridades · Cumplimiento de objetivos\n\nPensá en la empresa como un sistema completo. Una mejora en un área no siempre significa una mejora para toda la organización."
    },
    "responsibilities": [
      "Coordinar las distintas áreas de la empresa.",
      "Definir prioridades y objetivos generales.",
      "Evaluar el impacto global de las decisiones.",
      "Resolver conflictos entre sectores.",
      "Tomar decisiones estratégicas."
    ],
    "modifiers": {
      "ana": 1,
      "vis": 3,
      "neg": 1,
      "ope": 0,
      "ada": 0
    },
    "configuredModifiers": [
      {
        "key": "ana",
        "name": "Análisis",
        "abbreviation": "ANA",
        "value": 1
      },
      {
        "key": "vis",
        "name": "Visión Sistémica",
        "abbreviation": "VIS",
        "value": 3
      },
      {
        "key": "neg",
        "name": "Negociación",
        "abbreviation": "NEG",
        "value": 1
      }
    ],
    "abilities": [
      {
        "name": "Visión Sistémica",
        "type": "active",
        "description": "Una vez por partida, El Búho puede intervenir en una decisión de gasto o inversión que haya sido bloqueada por la política financiera de La Ardilla, autorizándola por decreto ejecutivo sin sufrir penalizaciones de coordinación.",
        "condition": "",
        "useLimit": 1,
        "useScope": "game"
      },
      {
        "name": "Decreto de Prioridad Nacional",
        "type": "support",
        "description": "Declara un proyecto o tarea como \"Prioridad Directiva\". Durante esa ronda, todas las tiradas de los demás jugadores orientadas a resolver esa tarea reciben un bonus de +2.",
        "condition": "",
        "useLimit": 1,
        "useScope": "game"
      },
      {
        "name": "Veto Presupuestario",
        "type": "interruption",
        "description": "Puede congelar temporalmente cualquier compra propuesta por otro departamento para obligar a una segunda ronda de debate o exigir una tirada de Análisis de Datos previa.",
        "condition": "",
        "useLimit": 1,
        "useScope": "round"
      }
    ],
    "weaknesses": [],
    "restrictions": []
  },
  {
    "id": "zorro",
    "label": "El Zorro — Comercial",
    "fields": {
      "name": "Comercial",
      "department": "Comercial",
      "description": "Representa la relación con clientes y mercado. Busca generar oportunidades sin comprometer a la empresa con promesas que no pueda cumplir.",
      "visualIdentity": "El Zorro",
      "publicInformation": "Foco: Cliente · Demanda · Ventas · Compromisos · Propuesta de valor\n\nPensá desde la mirada del cliente, pero teniendo en cuenta qué puede cumplir realmente la empresa."
    },
    "responsibilities": [
      "Comprender las necesidades del cliente.",
      "Negociar condiciones comerciales.",
      "Analizar demanda y oportunidades.",
      "Comunicar al resto de las áreas los compromisos asumidos.",
      "Proteger la relación con los clientes."
    ],
    "modifiers": {
      "ana": 0,
      "vis": 2,
      "neg": 3,
      "ope": 0,
      "ada": 0
    },
    "configuredModifiers": [
      {
        "key": "vis",
        "name": "Visión Sistémica",
        "abbreviation": "VIS",
        "value": 2
      },
      {
        "key": "neg",
        "name": "Negociación",
        "abbreviation": "NEG",
        "value": 3
      }
    ],
    "abilities": [
      {
        "name": "Propuesta de Valor",
        "type": "active",
        "description": "Si el equipo logra reducir el tiempo de entrega (Lead Time) por debajo de un umbral crítico, El Zorro puede renegociar con el cliente para inyectar presupuesto adicional a la caja de la empresa.",
        "condition": "",
        "useLimit": 1,
        "useScope": "game"
      },
      {
        "name": "Margen de Tolerancia",
        "type": "revelation",
        "description": "Revela una ventana de negociación secreta con el cliente (por ejemplo, conseguir 3 a 5 días adicionales de plazo de entrega sin penalización de contrato).",
        "condition": "",
        "useLimit": 1,
        "useScope": "game"
      },
      {
        "name": "Endulzar el Trato",
        "type": "passive",
        "description": "Otorga Ventaja (tirar $2\\text{d}12$ y quedarse con el dado más alto) en cualquier tirada de Negociación frente a un cliente o proveedor externo exigente (NPC).",
        "condition": "",
        "useLimit": null,
        "useScope": null
      }
    ],
    "weaknesses": [],
    "restrictions": []
  },
  {
    "id": "castor",
    "label": "El Castor — Ingeniería",
    "fields": {
      "name": "Ingeniería",
      "department": "Ingeniería",
      "description": "Analiza problemas, estudia alternativas y evalúa la viabilidad técnica de las soluciones antes de implementarlas.",
      "visualIdentity": "El Castor",
      "publicInformation": "Foco: Viabilidad técnica · Datos · Procesos · Mejora continua · Tecnología\n\nNo te quedes solamente con el síntoma de un problema. Intentá entender qué está ocurriendo antes de proponer una solución."
    },
    "responsibilities": [
      "Analizar técnicamente los problemas.",
      "Identificar posibles causas.",
      "Evaluar alternativas de mejora.",
      "Estudiar la viabilidad de nuevas soluciones.",
      "Proponer mejoras en procesos y tecnología."
    ],
    "modifiers": {
      "ana": 3,
      "vis": 1,
      "neg": 0,
      "ope": 1,
      "ada": 0
    },
    "configuredModifiers": [
      {
        "key": "ana",
        "name": "Análisis",
        "abbreviation": "ANA",
        "value": 3
      },
      {
        "key": "vis",
        "name": "Visión Sistémica",
        "abbreviation": "VIS",
        "value": 1
      },
      {
        "key": "ope",
        "name": "Operaciones",
        "abbreviation": "OPE",
        "value": 1
      }
    ],
    "abilities": [
      {
        "name": "Plan de Acción A3",
        "type": "support",
        "description": "El Castor diseña una solución técnica previa en formato A3. Otorga un bonus de +2 a la tirada de ejecución o implementación de cualquier departamento aliado.",
        "condition": "",
        "useLimit": 1,
        "useScope": "game"
      },
      {
        "name": "Filtro de Estandarización",
        "type": "passive",
        "description": "Exige que cualquier propuesta operativa pase por un análisis de viabilidad. Si el equipo supera la tirada de Análisis de Procesos (CD 11), la mejora se vuelve permanente y no puede ser revertida por eventos aleatorios.",
        "condition": "Análisis de Procesos (CD 11).",
        "useLimit": null,
        "useScope": null
      },
      {
        "name": "Sprint Tecnológico",
        "type": "active",
        "description": "Propone la integración de una herramienta digital o automatización que otorga un bonus temporal de velocidad a todo el equipo durante un turno completo.",
        "condition": "",
        "useLimit": 1,
        "useScope": "game"
      }
    ],
    "weaknesses": [],
    "restrictions": []
  },
  {
    "id": "toro",
    "label": "El Toro — Producción",
    "fields": {
      "name": "Producción",
      "department": "Producción",
      "description": "Representa la operación real de la empresa. Se preocupa por la capacidad, los recursos disponibles y que las soluciones puedan funcionar en la práctica.",
      "visualIdentity": "El Toro",
      "publicInformation": "Foco: Producción · Capacidad · Recursos · Cuellos de botella · Aplicación práctica\n\nPensá en lo que realmente puede hacerse en la operación. Una solución puede ser buena en teoría y no funcionar en la práctica."
    },
    "responsibilities": [
      "Gestionar la operación diaria.",
      "Analizar capacidad productiva.",
      "Detectar problemas en el proceso.",
      "Evaluar el impacto operativo de las decisiones.",
      "Asegurar que las mejoras puedan aplicarse realmente."
    ],
    "modifiers": {
      "ana": 1,
      "vis": 0,
      "neg": 1,
      "ope": 3,
      "ada": 0
    },
    "configuredModifiers": [
      {
        "key": "ana",
        "name": "Análisis",
        "abbreviation": "ANA",
        "value": 1
      },
      {
        "key": "neg",
        "name": "Negociación",
        "abbreviation": "NEG",
        "value": 1
      },
      {
        "key": "ope",
        "name": "Operaciones",
        "abbreviation": "OPE",
        "value": 3
      }
    ],
    "abilities": [
      {
        "name": "Kaizen Sprint",
        "type": "active",
        "description": "Elimina de forma automática un cuello de botella menor o falla operativa en el taller, recuperando días de Lead Time o destrabando la línea sin necesidad de tirar dados.",
        "condition": "",
        "useLimit": 1,
        "useScope": "game"
      },
      {
        "name": "Golpe de Taller",
        "type": "active",
        "description": "Una vez por ronda, ante un fallo mecánico o atasco de material, El Toro puede realizar una tirada de Ejecución Directa contra CD 12. Si tiene éxito, soluciona el problema de inmediato en lugar de perder un turno.",
        "condition": "",
        "useLimit": 1,
        "useScope": "round"
      },
      {
        "name": "Resistencia de Planta",
        "type": "passive",
        "description": "Ignora la primera penalización de tiempo o desgaste que sufra la producción debido a eventos aleatorios de falla de maquinaria.",
        "condition": "",
        "useLimit": null,
        "useScope": null
      }
    ],
    "weaknesses": [],
    "restrictions": []
  },
  {
    "id": "ardilla",
    "label": "La Ardilla — Finanzas",
    "fields": {
      "name": "Finanzas",
      "department": "Finanzas",
      "description": "Evalúa el impacto económico de las decisiones y busca mantener la sostenibilidad financiera de la empresa.",
      "visualIdentity": "La Ardilla",
      "publicInformation": "Foco: Presupuesto · Costos · Ingresos · Liquidez · Riesgo financiero\n\nNo mires solamente cuánto cuesta una decisión. Pensá también qué beneficio puede generar, cuándo se recupera el dinero y qué impacto tiene sobre la caja."
    },
    "responsibilities": [
      "Controlar el presupuesto.",
      "Analizar costos y beneficios.",
      "Evaluar inversiones.",
      "Controlar el flujo de caja.",
      "Identificar riesgos financieros."
    ],
    "modifiers": {
      "ana": 2,
      "vis": 1,
      "neg": 2,
      "ope": 0,
      "ada": 0
    },
    "configuredModifiers": [
      {
        "key": "ana",
        "name": "Análisis",
        "abbreviation": "ANA",
        "value": 2
      },
      {
        "key": "vis",
        "name": "Visión Sistémica",
        "abbreviation": "VIS",
        "value": 1
      },
      {
        "key": "neg",
        "name": "Negociación",
        "abbreviation": "NEG",
        "value": 2
      }
    ],
    "abilities": [
      {
        "name": "Análisis de Causa Raíz / Auditoría Oculta",
        "type": "revelation",
        "description": "Revela una fuga invisible de dinero o costos acumulados por inventario en proceso (WIP). Si el equipo implementa una regulación de flujo (Pull/Kanban), libera caja financiera de forma continua en cada ronda.",
        "condition": "",
        "useLimit": 1,
        "useScope": "game"
      },
      {
        "name": "Cierre de Grifo",
        "type": "passive",
        "description": "Bloquea automáticamente cualquier gasto o compra individual que supere el 50% del presupuesto disponible del equipo, a menos que Dirección (El Búho) active su Visión Sistémica.",
        "condition": "",
        "useLimit": null,
        "useScope": null
      },
      {
        "name": "Reserva de Emergencia",
        "type": "active",
        "description": "Recupera dinero de partidas contables mal asignadas o imprevistos para inyectarlo al presupuesto disponible cuando la caja está al borde de la quiebra.",
        "condition": "",
        "useLimit": 1,
        "useScope": "game"
      }
    ],
    "weaknesses": [],
    "restrictions": []
  }
];
