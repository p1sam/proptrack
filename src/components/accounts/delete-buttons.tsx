"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteAccountEvent, deleteFee } from "@/server/actions/accounts";
import { Button } from "@/components/ui/button";
import { handleResult } from "./form-utils";

export function DeleteEventButton({ id, label = "Delete note" }: { id: string; label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      title={label}
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Delete this note from the timeline?")) return;
        start(async () => {
          if (handleResult(await deleteAccountEvent({ id }), "Note deleted").ok) router.refresh();
        });
      }}
    >
      <Trash2 />
    </Button>
  );
}

export function DeleteFeeButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={`Delete ${label}`}
      title={`Delete ${label}`}
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Delete this ${label.toLowerCase()}? ROI and net cash flow will be recalculated.`)) return;
        start(async () => {
          if (handleResult(await deleteFee({ id }), "Fee deleted").ok) router.refresh();
        });
      }}
    >
      <Trash2 />
    </Button>
  );
}
