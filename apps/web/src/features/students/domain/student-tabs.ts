// Tabs of the participant's game page (#32). Add "Mi situación" here (and its page) when it exists.
export type StudentTab = "ficha" | "dashboard";
export const studentTabs: Array<{ tab: StudentTab; label: string }> = [
  { tab: "ficha", label: "Mi ficha" },
  { tab: "dashboard", label: "Dashboard" },
];
export const defaultStudentTab: StudentTab = "ficha";
