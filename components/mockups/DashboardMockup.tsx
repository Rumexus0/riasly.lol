export default function DashboardMockup({ label }: { label?: string }) {
  return (
    <div
      className="overflow-hidden rounded-card border border-edge bg-panel shadow-glow"
      role="img"
      aria-label={label ?? "riasly dashboard preview"}
    >
      {/* window chrome */}
      <div className="flex items-center gap-2 border-b border-edge2 bg-input px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-plumborder/70" />
        <span className="h-3 w-3 rounded-full bg-edge" />
        <span className="h-3 w-3 rounded-full bg-edge" />
        <div className="ml-3 h-5 flex-1 rounded-micro bg-nearblack" />
      </div>

      <div className="flex">
        {/* sidebar */}
        <aside className="hidden w-40 shrink-0 flex-col gap-2 border-r border-edge2 bg-input p-4 sm:flex">
          <div className="mb-2 h-6 w-24 rounded-micro bg-plum/60" />
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`h-8 rounded-micro ${
                i === 0 ? "bg-plum/40" : "bg-nearblack"
              }`}
            />
          ))}
        </aside>

        {/* main */}
        <div className="flex-1 space-y-4 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <div className="h-6 w-40 rounded-micro bg-nearblack" />
            <div className="h-9 w-28 rounded-pill bg-plum" />
          </div>

          {/* stat row */}
          <div className="grid grid-cols-3 gap-3">
            {["Views", "Uploads", "Links"].map((s) => (
              <div
                key={s}
                className="rounded-card border border-edge2 bg-nearblack p-3"
              >
                <div className="mb-2 h-3 w-12 rounded-full bg-edge" />
                <div className="h-6 w-16 rounded-micro bg-plum/50" />
              </div>
            ))}
          </div>

          {/* upload progress */}
          <div className="rounded-card border border-edge2 bg-nearblack p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="h-4 w-28 rounded-full bg-edge" />
              <div className="h-4 w-10 rounded-full bg-edge" />
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-input">
              <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-plum to-plumborder" />
            </div>
          </div>

          {/* file grid */}
          <div className="grid grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="aspect-square rounded-card border border-edge2 bg-nearblack"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
