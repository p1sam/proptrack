"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

function filenameFrom(res: Response, fallback: string) {
  const cd = res.headers.get("Content-Disposition") ?? "";
  return /filename="([^"]+)"/.exec(cd)?.[1] ?? fallback;
}

/**
 * Downloads a generated report from an /api/export route. Fetching (instead of a plain link)
 * lets us show progress while the server renders and surface errors such as rate limits.
 */
export function DownloadButton({ href, label, fallbackName, variant = "outline" }: { href: string; label: string; fallbackName: string; variant?: "default" | "outline" | "secondary" }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      disabled={busy}
      aria-busy={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await fetch(href, { credentials: "same-origin" });
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as { error?: string } | null;
            throw new Error(body?.error ?? `Download failed (${res.status})`);
          }
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filenameFrom(res, fallbackName);
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 10_000);
          toast.success(`Downloaded ${a.download}`);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Download failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : <Download />}
      {busy ? "Generating…" : label}
    </Button>
  );
}
