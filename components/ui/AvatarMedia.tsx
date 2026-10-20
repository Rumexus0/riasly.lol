"use client";

import { useEffect, useState } from "react";

import { useKeepPlaying } from "@/lib/keep-playing";
import { isVideoSrc } from "@/lib/media-kind";

/**
 * Renders a profile picture slot: a looping muted video for mp4/webm/mov, an
 * <img> for GIF/WebP/PNG/JPG, and the caller's fallback when there is no source
 * or the media failed to load.
 *
 * Shared by the public profile circle and both dashboard previews so the
 * "video or image?" decision exists in exactly one place. It fills its parent,
 * which keeps ownership of size and rounding.
 *
 * The visibility handler is deliberately local: every place that shows an
 * avatar gets tab-resume behaviour without the parent having to wire it up.
 */
export default function AvatarMedia({
  src,
  fallback,
}: {
  src: string | null | undefined;
  fallback: React.ReactNode;
}) {
  const video = isVideoSrc(src);
  const [failed, setFailed] = useState(false);
  const { keepPlaying, keepPlayingProps } = useKeepPlaying<HTMLVideoElement>();

  // A new source is a fresh chance to load; do not stay on the old error.
  useEffect(() => setFailed(false), [src]);

  useEffect(() => {
    if (!video) return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") keepPlaying();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [video, keepPlaying]);

  if (!src || failed) return <>{fallback}</>;

  if (video) {
    return (
      <video
        className="h-full w-full object-cover"
        src={src}
        autoPlay
        muted
        loop
        playsInline
        // The circle is 112px: pulling the whole clip down up front would be
        // pure waste, and loop+autoplay still starts as soon as it can.
        preload="metadata"
        onError={() => setFailed(true)}
        {...keepPlayingProps}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="h-full w-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}
