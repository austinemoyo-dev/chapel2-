'use client';

import dynamic from 'next/dynamic';
import Spinner from '@/components/ui/Spinner';

// @vladmandic/face-api uses TextEncoder at module init time, which crashes
// in Node.js during SSR. ssr: false prevents the chunk from loading server-side.
const FaceCaptureContent = dynamic(() => import('./FaceCaptureContent'), {
  ssr: false,
  loading: () => (
    <div className="flex justify-center py-20">
      <Spinner />
    </div>
  ),
});

export default function FaceCapturePage() {
  return <FaceCaptureContent />;
}
