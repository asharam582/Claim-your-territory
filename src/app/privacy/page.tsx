import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy Policy for The World Is For Sale.",
};

export default function Privacy() {
  return (
    <main className="legal">
      <Link href="/" className="back">← Back</Link>
      <h1>Privacy Policy</h1>
      <p className="updated">Last updated: August 2026</p>

      <h2>1. What we collect</h2>
      <p>When you claim a spot, we collect:</p>
      <ul>
        <li><strong>Display name</strong> — shown publicly on the board.</li>
        <li><strong>Email</strong> — used for payment processing and receipts.
          Not shown publicly.</li>
        <li><strong>Link URL</strong> (optional) — shown publicly on your spot.</li>
        <li><strong>Logo image</strong> (optional) — shown publicly on your spot.
          Screened by an automated moderation service before display.</li>
      </ul>

      <h2>2. What we don&apos;t collect</h2>
      <p>
        We do not collect passwords, payment card details (handled entirely by
        our payment provider), browsing history, cookies for tracking, or any
        data beyond what you enter in the claim form.
      </p>

      <h2>3. How we use your data</h2>
      <ul>
        <li>Display name, link, and logo are shown publicly on the board — that
          is the product you are paying for.</li>
        <li>Email is sent to the payment provider to process your transaction
          and is stored in our database for order records.</li>
        <li>Uploaded images are screened by a moderation service (for content
          safety) and stored in our cloud storage.</li>
      </ul>

      <h2>4. Third-party services</h2>
      <p>We use:</p>
      <ul>
        <li><strong>Supabase</strong> — database and file storage.</li>
        <li><strong>Stripe or Dodo Payments</strong> — payment processing. Your
          payment details are handled entirely by them under their own privacy
          policies.</li>
        <li><strong>Vercel</strong> — hosting.</li>
        <li><strong>OpenAI</strong> (optional) — image moderation for uploaded logos.</li>
      </ul>

      <h2>5. Data retention</h2>
      <p>
        Your display name, link, and logo remain on the board until someone
        conquers your spot. Payment records (including email) are retained
        for bookkeeping and dispute resolution.
      </p>

      <h2>6. Your rights</h2>
      <p>
        To request deletion of your data or to ask what data we hold about you,
        email <strong>[your-email]</strong>. Note that removing a spot does not
        entitle you to a refund.
      </p>

      <h2>7. Changes</h2>
      <p>
        We may update this policy at any time. Continued use of the platform
        after changes constitutes acceptance.
      </p>

      <div className="legal-footer">
        <Link href="/terms">Terms of Service</Link>
        <span>·</span>
        <Link href="/">Home</Link>
      </div>
    </main>
  );
}
