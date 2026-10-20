"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { updateProfileStyle, type ActionResult } from "@/app/actions/profile";
import {
  BG_EFFECT_CHOICES,
  DEFAULT_PANEL,
  NAME_EFFECT_PRESETS,
  USERNAME_EFFECTS,
  type ProfileAlignment,
  type ProfileStyle,
} from "@/lib/profile-style";
import GlassCard from "@/components/ui/GlassCard";
import {
  CardTitle,
  FeedbackLine,
  btnGhost,
  btnPrimary,
  inputCls,
  useFeedback,
} from "@/components/dashboard/form-kit";
import type { CustomizeProfile } from "@/components/dashboard/CustomizeClient";
import EffectPickerModal, {
  type EffectColumn,
} from "@/components/dashboard/EffectPickerModal";
import EffectLayers from "@/components/profile/EffectLayers";
import type { FxKey } from "@/lib/template-recipes";

// Every optional value in this form is "at rest = null", so the editor mirrors
// that: a colour has an ON switch, the frosted panel has one too. When a control
// is OFF we render its input `disabled`, and a disabled input is simply absent
// from FormData — which the server normalizes straight back to null. That is how
// un-ticking a colour genuinely clears it instead of leaving a stale value.
type ColorState = { on: boolean; value: string };
type PanelState = { on: boolean; opacity: number; blur: number };

type FormState = {
  bio: string;
  accentColor: string;
  textColor: ColorState;
  bgColor: ColorState;
  iconColor: ColorState;
  effectColor: ColorState;
  // Secondary/tertiary palette stops ("" = unset). Carried to the server by
  // hidden inputs, and only while the primary effect colour is ON.
  effectColor2: string;
  effectColor3: string;
  panel: PanelState;
  bgEffect: string; // "" = keep the template's own recipe
  usernameEffect: string;
  profileAlign: ProfileAlignment;
  location: string;
  profileGradient: boolean;
  monochromeIcons: boolean;
  animatedTitle: boolean;
  boxColors: boolean;
  soundEnabled: boolean;
  discordAvatarDecoration: boolean;
  glitterName: boolean;
  glitterSocials: boolean;
  glitterBadges: boolean;
};

function initialFrom(
  profile: CustomizeProfile,
  style: ProfileStyle
): FormState {
  return {
    bio: profile.bio,
    accentColor: profile.accentColor,
    textColor: { on: !!style.textColor, value: style.textColor ?? "#ffffff" },
    bgColor: { on: !!style.bgColor, value: style.bgColor ?? "#0b0b12" },
    iconColor: { on: !!style.iconColor, value: style.iconColor ?? "#8b5cf6" },
    effectColor: {
      on: !!style.effectColor,
      value: style.effectColor ?? "#8b5cf6",
    },
    effectColor2: style.effectColors[1] ?? "",
    effectColor3: style.effectColors[2] ?? "",
    panel: {
      on: style.profileOpacity != null || style.profileBlur != null,
      opacity: style.profileOpacity ?? DEFAULT_PANEL.opacity,
      blur: style.profileBlur ?? DEFAULT_PANEL.blur,
    },
    bgEffect: style.bgEffect ?? "",
    usernameEffect: style.usernameEffect ?? "none",
    profileAlign: style.profileAlign ?? "center",
    location: style.location ?? "",
    profileGradient: style.profileGradient,
    monochromeIcons: style.monochromeIcons,
    animatedTitle: style.animatedTitle,
    boxColors: style.boxColors,
    soundEnabled: style.soundEnabled,
    discordAvatarDecoration: style.discordAvatarDecoration,
    glitterName: style.glitterName,
    glitterSocials: style.glitterSocials,
    glitterBadges: style.glitterBadges,
  };
}

/**
 * Sections 2–4 of the customize page — general, colours and "other" — as ONE
 * form with a single sticky save bar. It writes everything except the media
 * slots through `updateProfileStyle`, which never touches avatar/background/
 * cursor/sound, so an immediate upload made in the cards above can never be
 * undone by this form saving a stale URL.
 *
 * The Discord connection is not a field here either: the id belongs to the OAuth
 * grant owned by DiscordConnectCard, and because `updateProfileStyle` writes a
 * full set of style columns, a form that still sent `discordSnowflake` would
 * clear somebody's connection the next time they pressed save.
 */
export default function StyleForm({
  profile,
  style,
  hasSound,
  discordConnected,
}: {
  profile: CustomizeProfile;
  style: ProfileStyle;
  /** Whether a sound is uploaded — gates the "sound control" toggle's hint. */
  hasSound: boolean;
  /** Whether the owner has connected Discord through OAuth. */
  discordConnected: boolean;
}) {
  const tp = useTranslations("dashboard.customizePage");
  const router = useRouter();
  const { fb, report } = useFeedback({ ok: tp("saveBar.saved") });

  // `baseline` is what the server currently holds. It seeds from props once and
  // is re-synced after a successful save; dirty state is measured against it, so
  // a background router.refresh() cannot make a freshly-saved form look unsaved.
  const seed = useMemo(() => initialFrom(profile, style), [profile, style]);
  const [baseline, setBaseline] = useState(seed);
  const [state, setState] = useState(seed);
  const [busy, setBusy] = useState(false);

  const dirty = JSON.stringify(state) !== JSON.stringify(baseline);

  // Effect pickers: a trigger button opens a live-preview grid modal. The two
  // hidden inputs below carry the values into FormData, so updateProfileStyle and
  // the dirty/baseline comparison are untouched.
  const [usernameOpen, setUsernameOpen] = useState(false);
  const [bgOpen, setBgOpen] = useState(false);

  // Sample word is a fixed i18n string so every visitor sees the same preview and
  // the tiles never re-render on selection changes (memoised on the accent only).
  const sample = tp("effectsPicker.previewName");
  // The tiles must read the same --fx-accent the profile root will set. Without
  // it every accent-driven preview falls back to the CSS default violet, so a
  // cyan profile showed a violet name in its own picker.
  const previewAccent = state.effectColor.on
    ? state.effectColor.value
    : state.accentColor;
  // The tiles must also read the secondary/tertiary stops, or a recoloured
  // gradient/glitch would show the old hardcoded cyan/magenta in its own picker
  // while the live profile paints the new palette (the bug the note above warns).
  const previewAccent2 =
    state.effectColor.on && state.effectColor2 ? state.effectColor2 : undefined;
  const previewAccent3 =
    state.effectColor.on && state.effectColor3 ? state.effectColor3 : undefined;
  const usernameColumns = useMemo<EffectColumn[]>(
    () =>
      USERNAME_EFFECTS.map((k) => ({
        key: k,
        label: tp(`usernameEffects.${k}`),
        preview: (
          <span
            className={
              k === "none" ? undefined : `name-${k} inline-block`
            }
            style={
              {
                ["--fx-accent" as string]: previewAccent,
                ...(previewAccent2
                  ? { ["--fx-accent2" as string]: previewAccent2 }
                  : {}),
                ...(previewAccent3
                  ? { ["--fx-accent3" as string]: previewAccent3 }
                  : {}),
              } as React.CSSProperties
            }
          >
            {sample}
          </span>
        ),
      })),
    // `tp` is left out on purpose: next-intl hands back a new function on every
    // render, so listing it would rebuild these tiles (and re-mount every preview
    // span) on unrelated keystrokes. Going stale is not the trade — `sample` is
    // itself translated, so it changes the moment the locale does and the memo
    // recomputes with the new labels.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sample, previewAccent, previewAccent2, previewAccent3]
  );
  const bgColumns = useMemo<EffectColumn[]>(
    () => [
      {
        key: "",
        label: tp("effects.template"),
        preview: <span className="text-xs text-mutedtext/50">—</span>,
      },
      ...BG_EFFECT_CHOICES.map((k) => ({
        key: k as string,
        label: tp(`effects.${k}`),
        preview:
          k === "none" ? (
            <span className="text-xs text-mutedtext/50">—</span>
          ) : (
            <div className="relative h-full w-full overflow-hidden">
              <EffectLayers
                fx={[k as FxKey]}
                accent={state.accentColor}
                compact
              />
            </div>
          ),
      })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.accentColor]
  );

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  // Preset labels are STATIC tp() calls (not a template per id) so the i18n
  // audit proves every palette name exists in BOTH dictionaries at build time.
  const presetLabels: Record<string, string> = {
    violet: tp("effectPresets.violet"),
    sunset: tp("effectPresets.sunset"),
    emerald: tp("effectPresets.emerald"),
    ruby: tp("effectPresets.ruby"),
    gold: tp("effectPresets.gold"),
    ice: tp("effectPresets.ice"),
    candy: tp("effectPresets.candy"),
    neon: tp("effectPresets.neon"),
    mono: tp("effectPresets.mono"),
  };

  function applyPreset(colors: readonly string[]) {
    set("effectColor", { on: true, value: colors[0] });
    set("effectColor2", colors[1] ?? "");
    set("effectColor3", colors[2] ?? "");
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const res: ActionResult = await updateProfileStyle(new FormData(e.currentTarget));
    if (res.ok) {
      // What we just wrote becomes the new clean baseline.
      setBaseline(state);
    }
    report(res);
    setBusy(false);
    router.refresh();
  }

  function onReset() {
    setState(baseline);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* ===== Section 2 · General ===== */}
      <GlassCard className="p-6">
        <CardTitle>{tp("sections.general")}</CardTitle>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm text-mutedtext">
              {tp("fields.bio")}
            </label>
            <textarea
              name="bio"
              rows={3}
              maxLength={280}
              value={state.bio}
              onChange={(e) => set("bio", e.target.value)}
              placeholder={tp("fields.bioPlaceholder")}
              className="w-full rounded-field border border-white/10 bg-white/[0.02] px-3 py-2 text-softwhite placeholder:text-mutedtext/40 transition focus:border-plumborder focus:shadow-glow focus:outline-none"
            />
          </div>

          {/* Frosted panel: opacity + blur, behind one ON switch */}
          <PanelControls
            tp={tp}
            panel={state.panel}
            onChange={(p) => set("panel", p)}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <EffectTrigger
              label={tp("fields.bgEffect")}
              valueLabel={
                state.bgEffect === ""
                  ? tp("effects.template")
                  : tp(`effects.${state.bgEffect}`)
              }
              onOpen={() => setBgOpen(true)}
            />
            <EffectTrigger
              label={tp("fields.usernameEffect")}
              valueLabel={tp(`usernameEffects.${state.usernameEffect}`)}
              onOpen={() => setUsernameOpen(true)}
            />
          </div>

          {/* The real form fields. Hidden inputs carry the picker's choice into
              FormData so the server action never changes. */}
          <input type="hidden" name="bgEffect" value={state.bgEffect} />
          <input
            type="hidden"
            name="usernameEffect"
            value={state.usernameEffect}
          />
          {state.effectColor.on && (
            <>
              <input type="hidden" name="effectColor2" value={state.effectColor2} />
              <input type="hidden" name="effectColor3" value={state.effectColor3} />
            </>
          )}

          <EffectPickerModal
            open={bgOpen}
            title={tp("effectsPicker.bgTitle")}
            columns={bgColumns}
            currentValue={state.bgEffect}
            onPick={(k) => set("bgEffect", k)}
            onClose={() => setBgOpen(false)}
          />
          <EffectPickerModal
            open={usernameOpen}
            title={tp("effectsPicker.usernameTitle")}
            columns={usernameColumns}
            currentValue={state.usernameEffect}
            onPick={(k) => set("usernameEffect", k)}
            onClose={() => setUsernameOpen(false)}
            palette={
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-mutedtext/70">
                  {tp("effectsPicker.paletteTitle")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {NAME_EFFECT_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyPreset(p.colors)}
                      aria-label={presetLabels[p.id]}
                      title={presetLabels[p.id]}
                      className="flex h-8 w-14 overflow-hidden rounded-micro border border-white/10 transition hover:border-white/40"
                    >
                      {p.colors.map((c) => (
                        <span key={c} className="flex-1" style={{ background: c }} />
                      ))}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    {
                      label: tp("fields.effectColor"),
                      value: state.effectColor.value,
                      onPick: (v: string) =>
                        set("effectColor", { on: true, value: v }),
                    },
                    {
                      label: tp("fields.effectColor2"),
                      value: state.effectColor2 || "#22d3ee",
                      onPick: (v: string) => set("effectColor2", v),
                    },
                    {
                      label: tp("fields.effectColor3"),
                      value: state.effectColor3 || "#d946ef",
                      onPick: (v: string) => set("effectColor3", v),
                    },
                  ].map((c) => (
                    <label key={c.label} className="block">
                      <span className="mb-1 block text-xs text-mutedtext">
                        {c.label}
                      </span>
                      <input
                        type="color"
                        value={c.value}
                        onChange={(e) => c.onPick(e.target.value)}
                        className="h-9 w-full cursor-pointer rounded-micro border border-white/10 bg-white/[0.02]"
                      />
                    </label>
                  ))}
                </div>
              </div>
            }
          />

          <div>
            <label className="mb-1.5 block text-sm text-mutedtext">
              {tp("fields.location")}
            </label>
            <input
              name="location"
              type="text"
              maxLength={60}
              value={state.location}
              onChange={(e) => set("location", e.target.value)}
              placeholder={tp("fields.locationPlaceholder")}
              className={inputCls}
            />
          </div>

          {/* Where the profile content sits horizontally. Radios share the name so
              FormData carries exactly one value; the label keys are literal calls so
              the dictionary audit proves all three exist in both locales. */}
          <SegmentedField
            label={tp("fields.profileAlign")}
            name="profileAlign"
            value={state.profileAlign}
            onChange={(v) => set("profileAlign", v as ProfileAlignment)}
            options={[
              { value: "left", label: tp("alignments.left") },
              { value: "center", label: tp("alignments.center") },
              { value: "right", label: tp("alignments.right") },
            ]}
          />

          {/* Glitter trio lives in the general block, next to the name effect. */}
          <div className="flex flex-wrap gap-x-6 gap-y-3 pt-1">
            <SwitchField
              label={tp("fields.glitterName")}
              name="glitterName"
              checked={state.glitterName}
              onChange={(v) => set("glitterName", v)}
            />
            <SwitchField
              label={tp("fields.glitterSocials")}
              name="glitterSocials"
              checked={state.glitterSocials}
              onChange={(v) => set("glitterSocials", v)}
            />
            <SwitchField
              label={tp("fields.glitterBadges")}
              name="glitterBadges"
              checked={state.glitterBadges}
              onChange={(v) => set("glitterBadges", v)}
            />
          </div>
        </div>
      </GlassCard>

      {/* ===== Section 3 · Colours ===== */}
      <GlassCard className="p-6">
        <CardTitle>{tp("sections.colors")}</CardTitle>
        <div className="space-y-4">
          <ColorField
            label={tp("fields.accent")}
            name="accentColor"
            color={{ on: true, value: state.accentColor }}
            locked
            onChange={(_on, value) => set("accentColor", value)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <ColorField
              label={tp("fields.textColor")}
              name="textColor"
              color={state.textColor}
              onChange={(on, value) => set("textColor", { on, value })}
            />
            <ColorField
              label={tp("fields.bgColor")}
              name="bgColor"
              color={state.bgColor}
              onChange={(on, value) => set("bgColor", { on, value })}
            />
            <ColorField
              label={tp("fields.iconColor")}
              name="iconColor"
              color={state.iconColor}
              hint={tp("fields.iconColorHint")}
              onChange={(on, value) => set("iconColor", { on, value })}
            />
            <ColorField
              label={tp("fields.effectColor")}
              name="effectColor"
              color={state.effectColor}
              onChange={(on, value) => set("effectColor", { on, value })}
            />
          </div>
        </div>
      </GlassCard>

      {/* ===== Section 4 · Other ===== */}
      <GlassCard className="p-6">
        <CardTitle>{tp("sections.other")}</CardTitle>
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <SwitchField
            label={tp("fields.gradient")}
            name="profileGradient"
            checked={state.profileGradient}
            onChange={(v) => set("profileGradient", v)}
          />
          <SwitchField
            label={tp("fields.monochrome")}
            name="monochromeIcons"
            checked={state.monochromeIcons}
            onChange={(v) => set("monochromeIcons", v)}
          />
          <SwitchField
            label={tp("fields.animatedTitle")}
            name="animatedTitle"
            checked={state.animatedTitle}
            onChange={(v) => set("animatedTitle", v)}
          />
          <SwitchField
            label={tp("fields.boxColors")}
            name="boxColors"
            checked={state.boxColors}
            onChange={(v) => set("boxColors", v)}
          />
          <SwitchField
            label={tp("fields.soundControl")}
            name="soundEnabled"
            checked={state.soundEnabled}
            onChange={(v) => set("soundEnabled", v)}
            hint={!hasSound ? tp("hints.needSound") : undefined}
          />
          <SwitchField
            label={tp("fields.discordDecoration")}
            name="discordAvatarDecoration"
            checked={state.discordAvatarDecoration}
            onChange={(v) => set("discordAvatarDecoration", v)}
            disabled={!discordConnected}
          />
        </div>
      </GlassCard>

      {/* ===== Sticky save bar ===== */}
      <div className="sticky bottom-0 z-20 -mx-1 flex flex-wrap items-center gap-3 border border-white/10 bg-nearblack/85 px-4 py-3 backdrop-blur">
        <span className="text-sm text-mutedtext/80">
          {dirty ? tp("saveBar.unsaved") : tp("saveBar.saved")}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <FeedbackLine fb={fb} />
          <button
            type="button"
            onClick={onReset}
            disabled={!dirty || busy}
            className={btnGhost}
          >
            {tp("saveBar.reset")}
          </button>
          <button type="submit" disabled={busy || !dirty} className={btnPrimary}>
            {busy ? tp("saveBar.saving") : tp("saveBar.save")}
          </button>
        </div>
      </div>
    </form>
  );
}

// ---- Small controlled field helpers, local to this form ----

// A compact segmented radio group (e.g. profile position). The real radios are
// visually hidden inside each pill so the browser handles selection/keyboard and
// FormData gets a single value, while the pill shows which one is active.
function SegmentedField({
  label,
  name,
  value,
  options,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-sm text-mutedtext">{label}</span>
      <div className="inline-flex rounded-field border border-white/10 bg-white/[0.02] p-1">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <label key={o.value} className="cursor-pointer">
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={active}
                onChange={() => onChange(o.value)}
                className="sr-only"
              />
              <span
                className={`block rounded-[10px] px-4 py-1.5 text-sm transition ${active ? "bg-plumborder font-semibold text-softwhite" : "text-mutedtext hover:text-softwhite"}`}
              >
                {o.label}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function SwitchField({
  label,
  name,
  checked,
  onChange,
  hint,
  disabled,
}: {
  label: string;
  name: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start gap-3 ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
    >
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          type="checkbox"
          name={name}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span className="h-6 w-11 rounded-full bg-white/10 transition-colors peer-checked:bg-plumborder" />
        <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-softwhite transition-transform peer-checked:translate-x-5" />
      </span>
      <span>
        <span className="block text-sm text-softwhite">{label}</span>
        {hint && <span className="block text-xs text-mutedtext/60">{hint}</span>}
      </span>
    </label>
  );
}

function ColorField({
  label,
  name,
  color,
  locked,
  hint,
  onChange,
}: {
  label: string;
  name: string;
  color: ColorState;
  /** The accent colour always participates (it has a hard default). */
  locked?: boolean;
  /** Optional one-line explainer under the label, like SwitchField's hint. */
  hint?: string;
  onChange: (on: boolean, value: string) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="text-sm text-mutedtext">{label}</label>
        {!locked && (
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-mutedtext/70">
            <input
              type="checkbox"
              checked={color.on}
              onChange={(e) => onChange(e.target.checked, color.value)}
              className="h-3.5 w-3.5 accent-[color:var(--plumborder,#8b5cf6)]"
            />
          </label>
        )}
      </div>
      {hint && <p className="mb-1.5 text-xs text-mutedtext/60">{hint}</p>}
      <div className="flex items-center gap-3">
        <input
          type="color"
          name={name}
          disabled={!color.on}
          value={color.value}
          onChange={(e) => onChange(color.on, e.target.value)}
          className="h-10 w-14 shrink-0 cursor-pointer rounded-micro border border-white/10 bg-white/[0.02] disabled:cursor-not-allowed disabled:opacity-40"
        />
        <span className="font-mono text-xs uppercase text-mutedtext/70">
          {color.on ? color.value : "—"}
        </span>
      </div>
    </div>
  );
}

function EffectTrigger({
  label,
  valueLabel,
  onOpen,
}: {
  label: string;
  valueLabel: string;
  onOpen: () => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm text-mutedtext">{label}</label>
      <button
        type="button"
        onClick={onOpen}
        className="flex h-11 w-full items-center justify-between gap-2 rounded-field border border-white/10 bg-white/[0.02] px-3 text-left text-softwhite transition hover:border-plumborder focus:border-plumborder focus:shadow-glow focus:outline-none"
      >
        <span className="truncate">{valueLabel}</span>
        <span aria-hidden className="text-mutedtext">
          ▾
        </span>
      </button>
    </div>
  );
}

function PanelControls({
  tp,
  panel,
  onChange,
}: {
  tp: ReturnType<typeof useTranslations>;
  panel: PanelState;
  onChange: (p: PanelState) => void;
}) {
  return (
    <div>
      <SwitchField
        label={tp("fields.panel")}
        name="__panel_switch"
        checked={panel.on}
        onChange={(v) => onChange({ ...panel, on: v })}
      />
      {panel.on ? (
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <RangeField
            label={tp("fields.opacity")}
            name="profileOpacity"
            min={0}
            max={100}
            value={panel.opacity}
            onChange={(n) => onChange({ ...panel, opacity: n })}
          />
          <RangeField
            label={tp("fields.blur")}
            name="profileBlur"
            min={0}
            max={40}
            value={panel.blur}
            onChange={(n) => onChange({ ...panel, blur: n })}
          />
        </div>
      ) : (
        // OFF must write real zeros, not null: null means "untouched" and would
        // fall back to the default frost. Hidden inputs keep the names in
        // FormData so the server stores 0/0 — a genuinely frameless panel.
        <>
          <input type="hidden" name="profileOpacity" value="0" />
          <input type="hidden" name="profileBlur" value="0" />
        </>
      )}
    </div>
  );
}

function RangeField({
  label,
  name,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  name: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-sm text-mutedtext">{label}</label>
        <span className="font-mono text-xs text-mutedtext/70">{value}</span>
      </div>
      <input
        type="range"
        name={name}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[color:var(--plumborder,#8b5cf6)]"
      />
    </div>
  );
}
