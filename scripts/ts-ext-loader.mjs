// Node module-resolution hook used only by the template build scripts.
//
// The app is compiled by Next/TypeScript with bundler-style resolution, so its
// internal imports are written without an extension ("./media-kind"). Node's ESM
// loader requires one. Rather than rewrite every source file for the sake of a
// build script, this hook retries a failing relative specifier with ".ts" — which
// is also the form Node's type stripping needs.
//
// Nothing here runs in the app: it is registered explicitly by
// scripts/build-templates.mjs.

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
    const hasExt = /\.[a-z0-9]+$/i.test(specifier);
    if (!isRelative || hasExt) throw err;
    try {
      return await nextResolve(`${specifier}.ts`, context);
    } catch {
      throw err;
    }
  }
}
