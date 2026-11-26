"use client";
import { usePathname } from "next/navigation";
import { Breadcrumbs, type Crumb } from "@/components/shared/Breadcrumbs";

// #100: the game's route is drawn once by its layout for every tab. Inside a card of the Fichas tab it goes one or
// two levels deeper ("… › <Partida> › Fichas › Ficha [› Editar]"), so the back button points to Fichas or to the card.
export function gameCrumbItems(items: Crumb[], gameBase: string, pathname: string): Crumb[] {
  const prefix = `${gameBase}/fichas/`;
  const card = pathname.startsWith(prefix) ? pathname.slice(prefix.length).split("/") : null;
  if (!card?.[0]) return items;
  const deeper: Crumb[] = [{ ...items[items.length - 1], href: gameBase }, { label: "Fichas", href: `${gameBase}/fichas` }];
  if (card[1] === "editar") deeper.push({ label: "Ficha", href: `${prefix}${card[0]}` }, { label: "Editar" });
  else deeper.push({ label: "Ficha" });
  return [...items.slice(0, -1), ...deeper];
}

export function GameCrumbs({ items, gameBase }: { items: Crumb[]; gameBase: string }) {
  return <Breadcrumbs items={gameCrumbItems(items, gameBase, usePathname() ?? "")} />;
}
