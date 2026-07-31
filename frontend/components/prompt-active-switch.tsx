"use client";

import { useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { setPromptActive } from "@/lib/actions/prompts";

export function PromptActiveSwitch({
  promptId,
  active,
}: {
  promptId: string;
  active: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Switch
      checked={active}
      disabled={isPending}
      onCheckedChange={(checked) =>
        startTransition(() => setPromptActive(promptId, checked))
      }
    />
  );
}
