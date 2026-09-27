import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading analytics">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-8 w-full max-w-3xl" />
      <Skeleton className="h-8 w-80" />
      {[0, 1, 2].map((r) => (
        <div key={r} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-[74px]" />
          ))}
        </div>
      ))}
      <Skeleton className="h-[380px]" />
    </div>
  );
}
