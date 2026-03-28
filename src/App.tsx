import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import Index from "./pages/Index";
import WatchPage from "./pages/WatchPage";
import AuthPage from "./pages/AuthPage";
import PlatformLanding from "./pages/PlatformLanding";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/watch/:uid" element={<WatchPage />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/youtube-downloader" element={<PlatformLanding platform="youtube-downloader" />} />
            <Route path="/tiktok-downloader" element={<PlatformLanding platform="tiktok-downloader" />} />
            <Route path="/facebook-downloader" element={<PlatformLanding platform="facebook-downloader" />} />
            <Route path="/instagram-downloader" element={<PlatformLanding platform="instagram-downloader" />} />
            <Route path="/twitter-downloader" element={<PlatformLanding platform="twitter-downloader" />} />
            <Route path="/video-downloader" element={<PlatformLanding platform="video-downloader" />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
