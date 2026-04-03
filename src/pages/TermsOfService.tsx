import { ArrowLeft, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';

const TermsOfService = () => (
  <div className="min-h-screen bg-background">
    <div className="max-w-3xl mx-auto px-4 py-12 md:py-20">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Home
      </Link>
      <div className="flex items-center gap-3 mb-6">
        <FileText className="h-6 w-6 text-primary" />
        <h1 className="text-3xl font-bold">Terms of Service</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-8">Last updated: April 3, 2026</p>
      <div className="prose prose-invert max-w-none space-y-6 text-sm text-muted-foreground">
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">1. Acceptance of Terms</h2>
          <p>By accessing and using Incognito Zone, you agree to be bound by these Terms of Service. If you do not agree, please discontinue use immediately.</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">2. Description of Service</h2>
          <p>Incognito Zone provides a free tool to extract and download publicly available video content from the internet. The service is provided "as is" without any warranties.</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">3. User Responsibilities</h2>
          <p>You are solely responsible for ensuring that your use of downloaded content complies with applicable copyright laws and the terms of the originating platform. Do not use this service for unauthorized redistribution of copyrighted material.</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">4. Paywall & Premium Content</h2>
          <p>Our service can process direct video URLs including those from premium or subscription platforms. Users must have legitimate access to such content. We do not circumvent DRM or authentication systems — we only process URLs that are directly accessible.</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">5. Limitation of Liability</h2>
          <p>Incognito Zone shall not be liable for any damages arising from the use or inability to use our service. We do not guarantee the availability, accuracy, or quality of any downloaded content.</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">6. Service Availability</h2>
          <p>We strive to maintain 24/7 availability but do not guarantee uninterrupted access. The service may be temporarily unavailable due to maintenance or external factors.</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">7. Modifications</h2>
          <p>We reserve the right to modify these terms at any time. Continued use of the service after changes constitutes acceptance of the revised terms.</p>
        </section>
      </div>
    </div>
  </div>
);

export default TermsOfService;
