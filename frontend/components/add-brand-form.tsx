"use client";

import { useRef, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { addBrand } from "@/lib/actions/brands";

export function AddBrandForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [isCompetitor, setIsCompetitor] = useState(true);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      ref={formRef}
      action={(formData) =>
        startTransition(async () => {
          formData.set("is_competitor", String(isCompetitor));
          await addBrand(formData);
          formRef.current?.reset();
        })
      }
      className="flex flex-wrap items-center gap-2"
    >
      <Input name="url" placeholder="e.g. parachute.com" required className="max-w-xs" />
      <div className="flex overflow-hidden rounded-md border border-border">
        <button
          type="button"
          onClick={() => setIsCompetitor(false)}
          className={cn(
            "px-3 py-1.5 text-[12.5px]",
            !isCompetitor ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          )}
        >
          Our brand
        </button>
        <button
          type="button"
          onClick={() => setIsCompetitor(true)}
          className={cn(
            "border-l border-border px-3 py-1.5 text-[12.5px]",
            isCompetitor ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          )}
        >
          Competitor
        </button>
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Adding…" : "Add"}
      </Button>
    </form>
  );
}
