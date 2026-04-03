import { ArrowLeft, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';

const PrivacyPolicy = () => (
  <div className="min-h-screen bg-background">
    <div className="max-w-3xl mx-auto px-4 py-12 md:py-20">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Home
      </Link>
      <div className="flex items-center gap-3 mb-6">
        <Shield className="h-6 w-6 text-primary" />
        <h1 className="text-3xl font-bold">Privacy Policy</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-8">Last updated: April 3, 2026</p>
      <div className="prose prose-invert max-w-none space-y-6 text-sm text-muted-foreground">
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">1. Information We Collect</h2>
          <p>Incognito Zone does not collect, store, or share any personal information. We do not require account creation, login credentials, or any form of registration to use our service.</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">2. Usage Data</h2>
          <p>We do not use cookies, tracking pixels, or analytics software. No browsing history, IP addresses, or device information is stored on our servers.</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">3. Video Processing</h2>
          <p>All video URLs submitted to our service are processed in real-time. We do not cache, store, or retain any video content or metadata after the download session ends.</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">4. Third-Party Services</h2>
          <p>Our service processes video links from third-party platforms. We are not affiliated with any of these platforms. Users are responsible for complying with the terms of service of the respective platforms.</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">5. Data Security</h2>
          <p>Since we do not collect or store any data, there is no risk of data breaches from our end. All communications are encrypted via HTTPS.</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">6. Changes to This Policy</h2>
          <p>We may update this policy from time to time. Any changes will be reflected on this page with an updated revision date.</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">7. Contact</h2>
          <p>If you have questions about this policy, reach out via the contact information provided on our website.</p>
        </section>
      </div>
    </div>
  </div>
);

export default PrivacyPolicy;
