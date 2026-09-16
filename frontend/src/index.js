import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "@/index.css";
import App from "@/App";
import LicenseStatusPage from "@/components/LicenseStatusPage";
import ListenLivePage from "@/components/ListenLivePage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/live" element={<ListenLivePage />} />
          <Route path="/license" element={<LicenseStatusPage />} />
          <Route path="*" element={<App />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);

// Register the PWA service worker so DJs can install to their phone home screen
// (skipped inside the Electron desktop build, which is already fully offline).
if ("serviceWorker" in navigator && !(typeof window !== "undefined" && window.hotlive && window.hotlive.isElectron)) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${process.env.PUBLIC_URL || ""}/sw.js`).catch(() => {});
  });
}
