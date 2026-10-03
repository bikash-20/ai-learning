'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingState } from '@/components/ui/LoadingState';

/**
 * /(app)/ — the index of the protected area. Just bounces to /explore
 * (the hub). We can't put a real redirect in a "use client" file without
 * triggering a render, so we render a quiet skeleton while the
 * navigation happens.
 */
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/explore');
  }, [router]);
  return <LoadingState><div className="text-sm text-muted">Opening the hub…</div></LoadingState>;
}