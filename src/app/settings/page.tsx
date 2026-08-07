"use client";

import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const router = useRouter();
  return <main className="stage-shell flow-layout-shell"><section className="simple-page"><button className="simple-back" type="button" onClick={() => router.push("/")}>返回首页</button><p>还在做</p></section></main>;
}
