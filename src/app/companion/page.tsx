"use client";

import { useRouter } from "next/navigation";

export default function CompanionPage() {
  const router = useRouter();

  return (
    <main className="companion-page" aria-label="陪伴">
      <button className="simple-back companion-back back-arrow-button" type="button" aria-label="返回首页" onClick={() => router.push("/")}>
        <span className="back-arrow-icon" aria-hidden="true" />
      </button>
    </main>
  );
}
