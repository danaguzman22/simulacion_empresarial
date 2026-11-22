import { redirect } from "next/navigation";

// #72 / D-32: "Mis accesos" is no longer a screen. Old links land on the home page, which shows who is signed in.
export default function AccessPage() {
  redirect("/");
}
