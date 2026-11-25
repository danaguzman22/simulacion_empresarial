"use client";
import Image from "next/image";
import { useState } from "react";
import { archetypeInfo, type Archetype } from "../domain/archetype";
import { ArchetypeArt } from "./ArchetypeArt";

// #106: the archetype's illustration (NEXUS own art, public/arquetipos/<archetype>.webp, 960x600, already optimized).
// If it does not load, the card falls back to the vector drawing, so a card never shows a broken image.
export function ArchetypeIllustration({ archetype, idPrefix }: { archetype: Exclude<Archetype, "ninguno">; idPrefix: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <ArchetypeArt archetype={archetype} idPrefix={idPrefix} />;
  return <Image src={`/arquetipos/${archetype}.webp`} alt={`Ilustración de ${archetypeInfo[archetype].label}`} fill unoptimized
    sizes="(min-width: 768px) 352px, 100vw" className="object-cover" onError={() => setFailed(true)} />;
}
