import { getStudentCard } from "@/features/students/application/student-access";
import { StudentCard } from "@/features/students/components/StudentCard";
export const dynamic = "force-dynamic";
export default async function StudentGamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StudentCard data={await getStudentCard(id)} />;
}
