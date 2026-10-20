import Navbar from "./Navbar";
import Footer from "./Footer";
import Container from "./ui/Container";

export default function PageShell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <>
      <Navbar />
      <main className="flex min-h-[70vh] flex-col py-14">
        <Container className={className}>{children}</Container>
      </main>
      <Footer />
    </>
  );
}
