import { redirect } from "next/navigation";
import { env } from "@/lib/env";

export default function Home() {
  redirect(`/s/${env.defaultShopSlug}`);
}
