import { Skeleton } from '@/components/ui/skeleton';

const VideoSkeleton = () => {
  return (
    <div className="w-full max-w-2xl mx-auto mt-8 animate-fade-in">
      <div className="glass rounded-2xl overflow-hidden">
        {/* Thumbnail skeleton */}
        <div className="relative aspect-video">
          <Skeleton className="w-full h-full rounded-none" />
          <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
            <Skeleton className="h-8 w-28 rounded-lg" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-16 rounded-lg" />
              <Skeleton className="h-8 w-20 rounded-lg" />
            </div>
          </div>
        </div>

        {/* Info skeleton */}
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <Skeleton className="h-5 w-5 mt-1 rounded shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>

          {/* Download buttons skeleton */}
          <div className="space-y-2 pt-1">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoSkeleton;
