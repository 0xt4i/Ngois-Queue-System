import type { PublicShop } from "@/lib/types";
import { LanguageSwitcher } from "@/components/ui/language-switcher";

export function ShopHeader({ shop }: { shop: PublicShop }) {
  return (
    <header className="relative flex items-center justify-center gap-3 py-5">
      {shop.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- logo do chủ tiệm nhập URL bất kỳ
        <img src={shop.logoUrl} alt="" className="h-10 w-10 rounded-xl object-cover" />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-xl font-extrabold text-white">
          #
        </span>
      )}
      <h1 className="text-lg font-bold">{shop.name}</h1>
      <div className="absolute right-0 top-5"><LanguageSwitcher /></div>
    </header>
  );
}
