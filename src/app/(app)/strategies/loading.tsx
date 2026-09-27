import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading strategies">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-8 w-full max-w-3xl" />
      <div className="flex flex-col gap-2 rounded-lg border p-4">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-9" />
        ))}
      </div>
      <Skeleton className="h-[340px]" />
    </div>
  );
}
