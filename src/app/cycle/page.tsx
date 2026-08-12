"use client";

import { Suspense } from "react";
import { CycleReviewFlow } from "@/components/CycleReviewFlow";
import { LoadingState } from "@/components/LoadingState";

export default function CyclePage() {
  return <Suspense fallback={<LoadingState />}><CycleReviewFlow /></Suspense>;
}
