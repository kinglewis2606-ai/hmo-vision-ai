import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/parent");
  if (user.role !== "PARENT") redirect(user.role === "COACH" ? "/dashboard" : "/player");
  return children;
}
