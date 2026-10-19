"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { account, useSession } from "@/lib/account";

export default function FavoriteButton({ productId, handle }: { productId: string; handle: string }) {
  const { session } = useSession();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  useEffect(() => {
    if (!session) { setOn(false); return; }
    account().rpc("my_favorite_ids").then(({ data }) => setOn(((data as string[] | null) ?? []).includes(productId)));
  }, [session, productId]);
  async function toggle() {
    if (!session) { router.push(`/conta?seguir=${encodeURIComponent(`/produto/${handle}`)}`); return; }
    setBusy(true);
    const { data, error } = await account().rpc("favorite_toggle", { p_product: productId });
    setBusy(false);
    if (!error) setOn(!!data);
  }
  return (
    <button type="button" className={`fav${on ? " on" : ""}`} onClick={toggle} disabled={busy} aria-pressed={on}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.2-9.6C1.6 7.3 4 4 7.3 4c2 0 3.6 1.1 4.7 2.7C13.1 5.1 14.7 4 16.7 4 20 4 22.4 7.3 21.2 10.9c-1.7 5-9.2 9.6-9.2 9.6z" /></svg>
      {on ? "Nos favoritos" : "Guardar nos favoritos"}
    </button>
  );
}
