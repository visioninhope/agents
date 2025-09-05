import Link from "next/link";

export default function SupportPage() {
  return (
    <main className="flex flex-1 flex-col justify-center text-center">
      <h1 className="mb-4 text-2xl font-bold">Support</h1>
      <p className="text-fd-muted-foreground">
        Need help? You can browse our{" "}
        <Link
          href="/docs"
          className="text-fd-foreground font-semibold underline"
        >
          documentation
        </Link>{" "}
        or contact our support team.
      </p>
    </main>
  );
}
