import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function PlayerLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/player");
  if (user.role !== "PLAYER") redirect(user.role === "COACH" ? "/dashboard" : "/parent");
  return children;
}
