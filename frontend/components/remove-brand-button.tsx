"use client";

import { useTransition } from "react";
import { removeBrand } from "@/lib/actions/brands";

export function RemoveBrandButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(() => removeBrand(id))}
      disabled={isPending}
      className="text-muted-foreground hover:text-destructive"
      title="Remove"
    >
      ✕
    </button>
  );
}
