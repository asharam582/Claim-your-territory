import Link from "next/link";

export default function Success({
  searchParams,
}: {
  searchParams: { board?: string };
}) {
  const board = searchParams.board || "world";
  return (
    <main className="home" style={{ textAlign: "center" }}>
      <h1>Payment received.</h1>
      <p className="lead">
        If you won the spot, it&apos;s already yours on the board. If someone
        outbid you while you were paying, you were never charged — the hold is
        released automatically.
      </p>
      <Link className="btn primary" href={`/b/${board}`}>
        Back to the board
      </Link>
    </main>
  );
}
