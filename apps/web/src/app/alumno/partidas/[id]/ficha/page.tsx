import { getStudentCard } from "@/features/students/application/student-access";
import { StudentCard } from "@/features/students/components/StudentCard";

export const dynamic = "force-dynamic";

export default async function StudentCardTab({ params }: { params: Promise<{ id: string }> }) {
  return <StudentCard data={await getStudentCard((await params).id)} />;
}
