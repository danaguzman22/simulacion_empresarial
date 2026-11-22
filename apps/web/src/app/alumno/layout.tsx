import type { ReactNode } from "react";
import { UserBar } from "@/features/session/components/UserBar";

// #72: participant portal (games, Mi ficha and the participant's dashboard) with the user bar on top.
export default function ParticipantLayout({ children }: { children: ReactNode }) {
  return <><UserBar area="participant" />{children}</>;
}
