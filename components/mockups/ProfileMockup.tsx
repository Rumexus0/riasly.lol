const links = ["Instagram", "YouTube", "Discord", "Download .zip"];

export default function ProfileMockup({ label }: { label?: string }) {
  return (
    <div
      className="overflow-hidden rounded-card border border-edge bg-panel shadow-glow"
      role="img"
      aria-label={label ?? "Finished riasly profile page preview"}
    >
      {/* cover gradient */}
      <div className="h-24 animate-gradient-x bg-[length:200%_200%] bg-gradient-to-br from-aubergine via-plum to-nearblack" />

      <div className="flex flex-col items-center px-6 pb-6">
        {/* avatar */}
        <div className="-mt-10 flex h-20 w-20 items-center justify-center rounded-full border-4 border-panel bg-gradient-to-br from-plum to-aubergine text-2xl font-bold">
          @
        </div>

        <div className="mt-3 h-5 w-32 rounded-full bg-nearblack" />
        <div className="mt-2 h-3 w-44 rounded-full bg-input" />

        {/* verified pill */}
        <div className="mt-4 h-7 w-24 rounded-pill bg-plum/50" />

        {/* links */}
        <div className="mt-5 w-full space-y-3">
          {links.map((l) => (
            <div
              key={l}
              className="flex h-12 items-center justify-between rounded-card border border-edge2 bg-nearblack px-4"
            >
              <span className="text-sm font-medium text-softwhite">{l}</span>
              <span className="h-4 w-4 rounded-full bg-plumborder/70" />
            </div>
          ))}
        </div>

        {/* track / music bar */}
        <div className="mt-4 flex w-full items-center gap-3 rounded-card border border-edge2 bg-input px-4 py-3">
          <span className="h-6 w-6 rounded-full bg-plum" />
          <div className="flex-1">
            <div className="mb-2 h-2 w-24 rounded-full bg-edge" />
            <div className="h-1.5 w-full rounded-full bg-nearblack">
              <div className="h-full w-1/2 rounded-full bg-plumborder" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
