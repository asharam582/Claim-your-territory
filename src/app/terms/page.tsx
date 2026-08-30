import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms of Service for The World Is For Sale.",
};

export default function Terms() {
  return (
    <main className="legal">
      <Link href="/" className="back">← Back</Link>
      <h1>Terms of Service</h1>
      <p className="updated">Last updated: August 2026</p>

      <h2>1. What this is</h2>
      <p>
        The World Is For Sale is an interactive entertainment platform where you
        pay to place your logo, name, and link on a digital map or leaderboard
        (&quot;spot&quot;). It is a non-refundable digital novelty — not an investment,
        not gambling, and not an advertisement guarantee.
      </p>

      <h2>2. How spots work</h2>
      <p>
        When you claim or conquer a spot, you pay the listed price. Your logo,
        display name, and link are shown on that spot. <strong>Any other person
        can take your spot at any time by paying 1.5× what you paid.</strong> When
        that happens, your placement is removed and you receive nothing back.
        There are no refunds for conquered spots.
      </p>

      <h2>3. Payments</h2>
      <p>
        All payments are final and non-refundable. Prices are displayed in the
        board&apos;s currency. Payment is processed by our payment provider (Stripe
        or Dodo Payments). By completing a purchase, you agree that you are
        buying a temporary digital placement that can be taken from you at any
        time without compensation.
      </p>

      <h2>4. Content rules</h2>
      <p>
        Uploaded logos and display names must not contain: hate speech, explicit
        or adult content, copyrighted material you don&apos;t own, impersonation of
        real people or brands, or anything illegal. We reserve the right to
        remove any content without notice or refund.
      </p>

      <h2>5. No guarantees</h2>
      <p>
        We do not guarantee uptime, visibility, traffic, or any commercial
        benefit from holding a spot. This is entertainment. The service may be
        modified, paused, or shut down at any time.
      </p>

      <h2>6. Age requirement</h2>
      <p>You must be at least 18 years old to make a purchase on this platform.</p>

      <h2>7. Limitation of liability</h2>
      <p>
        The service is provided &quot;as is&quot; without warranties. Our total liability
        to you is limited to the amount you paid for your most recent spot
        purchase.
      </p>

      <h2>8. Changes</h2>
      <p>
        We may update these terms at any time. Continued use of the platform
        after changes constitutes acceptance.
      </p>

      <h2>9. Contact</h2>
      <p>
        For questions, disputes, or content removal requests, email us
        at <strong>[your-email]</strong>.
      </p>

      <div className="legal-footer">
        <Link href="/privacy">Privacy Policy</Link>
        <span>·</span>
        <Link href="/">Home</Link>
      </div>
    </main>
  );
}
