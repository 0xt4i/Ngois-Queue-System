import type { PublicShop } from "@/lib/types";

export function ShopHeader({ shop }: { shop: PublicShop }) {
  return (
    <header className="flex items-center justify-center gap-3 py-5">
      {shop.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- logo do chủ tiệm nhập URL bất kỳ
        <img src={shop.logoUrl} alt="" className="h-10 w-10 rounded-xl object-cover" />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-xl font-extrabold text-white">
          #
        </span>
      )}
      <h1 className="text-lg font-bold">{shop.name}</h1>
    </header>
  );
}
