"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Pencil, Square, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tool = "arrow" | "box" | "pen";
type Pt = { x: number; y: number };
type Shape = { tool: Tool; color: string; width: number; points: Pt[] };

const COLORS = [
  { value: "#ef4444", label: "Red" },
  { value: "#22c55e", label: "Green" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#eab308", label: "Yellow" },
  { value: "#ffffff", label: "White" },
];

function drawShape(ctx: CanvasRenderingContext2D, s: Shape) {
  const pts = s.points;
  if (pts.length < 2) return;
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const a = pts[0];
  const b = pts[pts.length - 1];
  if (s.tool === "box") {
    ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  } else if (s.tool === "arrow") {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const head = s.width * 4;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - head * Math.cos(angle - Math.PI / 7), b.y - head * Math.sin(angle - Math.PI / 7));
    ctx.lineTo(b.x - head * Math.cos(angle + Math.PI / 7), b.y - head * Math.sin(angle + Math.PI / 7));
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
}

/**
 * Draw arrows, boxes and freehand marks over a screenshot and export the result as a new image.
 * The source is loaded from our own origin, so the canvas stays untainted and can be exported.
 * Drawing is pointer-based (mouse, pen or touch).
 */
export function Annotator({ src, onCancel, onSave, saving }: { src: string; onCancel: () => void; onSave: (blob: Blob) => void; saving: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [current, setCurrent] = useState<Shape | null>(null);
  const [tool, setTool] = useState<Tool>("arrow");
  const [color, setColor] = useState(COLORS[0].value);

  useEffect(() => {
    const image = new Image();
    image.onload = () => setImg(image);
    image.onerror = () => setLoadError(true);
    image.src = src;
  }, [src]);

  const lineWidth = img ? Math.max(2, Math.round(Math.max(img.naturalWidth, img.naturalHeight) / 350)) : 3;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    for (const s of shapes) drawShape(ctx, s);
    if (current) drawShape(ctx, current);
  }, [img, shapes, current]);

  const toPoint = (e: React.PointerEvent<HTMLCanvasElement>): Pt => {
    const c = e.currentTarget;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };

  const exportBlob = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((png) => {
      if (png && png.size <= 8 * 1024 * 1024) return onSave(png);
      // Large screenshots: fall back to a compressed format that fits the upload limit.
      canvas.toBlob((webp) => webp && onSave(webp), "image/webp", 0.9);
    }, "image/png");
  };

  if (loadError) return <p className="text-sm text-destructive">Could not load the image for annotation.</p>;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Annotation tools">
        <div className="flex gap-1" role="radiogroup" aria-label="Tool">
          {(
            [
              ["arrow", ArrowUpRight, "Arrow"],
              ["box", Square, "Box"],
              ["pen", Pencil, "Freehand"],
            ] as const
          ).map(([t, Icon, label]) => (
            <Button key={t} type="button" size="sm" variant={tool === t ? "default" : "outline"} role="radio" aria-checked={tool === t} onClick={() => setTool(t)}>
              <Icon /> {label}
            </Button>
          ))}
        </div>
        <div className="flex gap-1" role="radiogroup" aria-label="Colour">
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={color === c.value}
              aria-label={c.label}
              onClick={() => setColor(c.value)}
              className={cn("size-7 rounded-md border-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50", color === c.value ? "border-foreground" : "border-transparent")}
              style={{ backgroundColor: c.value }}
            />
          ))}
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setShapes((s) => s.slice(0, -1))} disabled={!shapes.length}>
          <Undo2 /> Undo
        </Button>
      </div>
      <div className="max-h-[65vh] overflow-auto rounded-md border bg-muted/30">
        {!img && <p className="p-6 text-center text-sm text-muted-foreground">Loading image…</p>}
        <canvas
          ref={canvasRef}
          aria-label="Screenshot annotation canvas — drag to draw"
          className={cn("block h-auto w-full cursor-crosshair touch-none", !img && "hidden")}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            setCurrent({ tool, color, width: lineWidth, points: [toPoint(e)] });
          }}
          onPointerMove={(e) => {
            if (!current) return;
            const p = toPoint(e);
            setCurrent({ ...current, points: current.tool === "pen" ? [...current.points, p] : [current.points[0], p] });
          }}
          onPointerUp={() => {
            if (current && current.points.length > 1) setShapes((s) => [...s, current]);
            setCurrent(null);
          }}
          onPointerCancel={() => setCurrent(null)}
        />
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={exportBlob} disabled={!img || !shapes.length || saving}>
          {saving ? "Saving…" : "Save as new screenshot"}
        </Button>
      </div>
    </div>
  );
}
