"use client";

import { useTransition } from "react";
import { usePathname } from "next/navigation";
import { useLocale } from "next-intl";

import { switchLocale } from "@/app/actions/locale";

const options = [
  { code: "en", label: "English" },
  { code: "tr", label: "Türkçe" },
];

export default function LanguageSwitcher({
  label,
  className = "",
}: {
  label: string;
  className?: string;
}) {
  const pathname = usePathname();
  const current = useLocale();
  const [isPending, startTransition] = useTransition();

  return (
    <div className={className}>
      <label
        htmlFor="language-switch"
        className="mb-2 block text-xs uppercase tracking-widest text-mutedtext"
      >
        {label}
      </label>
      <select
        id="language-switch"
        defaultValue={current}
        disabled={isPending}
        aria-label={label}
        onChange={(e) => {
          const fd = new FormData();
          fd.set("locale", e.target.value);
          fd.set("redirectTo", pathname);
          startTransition(() => {
            switchLocale(fd);
          });
        }}
        className="h-11 w-44 rounded-field border border-edge bg-input px-3 text-softwhite focus:border-plumborder focus:outline-none disabled:opacity-60"
      >
        {options.map((o) => (
          <option key={o.code} value={o.code} className="bg-input">
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
