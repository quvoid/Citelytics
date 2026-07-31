"use client";

import { useRef, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { addPrompt } from "@/lib/actions/prompts";

export function AddPromptForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      ref={formRef}
      action={(formData) =>
        startTransition(async () => {
          await addPrompt(formData);
          formRef.current?.reset();
        })
      }
      className="flex gap-2"
    >
      <Input
        name="query_text"
        placeholder="e.g. best AI citation tracking tools 2026"
        required
        className="max-w-md"
      />
      <Button type="submit" disabled={isPending}>
        {isPending ? "Adding…" : "Add prompt"}
      </Button>
    </form>
  );
}
