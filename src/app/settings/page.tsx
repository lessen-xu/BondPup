"use client";

import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const router = useRouter();
  return <main className="stage-shell flow-layout-shell"><section className="simple-page"><button className="simple-back home-link" type="button" onClick={() => router.push("/")}>回家</button><p>还在做</p></section></main>;
}
