import { Skeleton } from '@/components/ui/skeleton';

const ScanSkeleton = () => {
  return (
    <div className="w-full max-w-5xl mx-auto mt-8 space-y-4 sm:space-y-6">
      {/* Header skeleton */}
      <div className="glass rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
        <Skeleton className="h-11 w-full sm:w-44 rounded-xl" />
      </div>

      {/* Grid skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="glass rounded-2xl overflow-hidden">
            <Skeleton className="aspect-video w-full" />
            <div className="p-3 sm:p-4 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-9 w-full rounded-xl mt-1" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ScanSkeleton;
