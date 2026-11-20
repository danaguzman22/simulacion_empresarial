import { redirect } from "next/navigation";
import { defaultStudentTab } from "@/features/students/domain/student-tabs";

export const dynamic = "force-dynamic";

export default async function StudentGamePage({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/alumno/partidas/${(await params).id}/${defaultStudentTab}`);
}
