"use client";

import { Suspense } from "react";
import { ReviewFlow } from "@/components/ReviewFlow";
import { LoadingState } from "@/components/LoadingState";

export default function ReviewPage() {
  return <Suspense fallback={<LoadingState />}><ReviewFlow /></Suspense>;
}
