import Navbar from "./Navbar";
import Footer from "./Footer";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="relative flex min-h-[70vh] items-center justify-center overflow-hidden py-16">
        <div
          className="pointer-events-none absolute inset-0 -z-10 bg-plumradial"
          aria-hidden
        />
        {children}
      </main>
      <Footer />
    </>
  );
}
