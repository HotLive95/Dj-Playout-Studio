import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "@/index.css";
import App from "@/App";
import LicenseStatusPage from "@/components/LicenseStatusPage";
import ListenLivePage from "@/components/ListenLivePage";
import KeyGenPage from "@/components/KeyGenPage";
import AdminPage from "@/components/AdminPage";

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
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/keygen" element={<KeyGenPage />} />
          <Route path="/live" element={<ListenLivePage />} />
          <Route path="/license" element={<LicenseStatusPage />} />
          <Route path="*" element={<App />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);

// PWA service worker: register ONLY in a production build (never in the CRA dev
// preview, where a service worker fights hot-reload and causes the page to flash/
// refresh repeatedly). In dev/preview, actively unregister any previously installed
// worker and clear its caches so the flashing stops for users who already got it.
if ("serviceWorker" in navigator && !(typeof window !== "undefined" && window.hotlive && window.hotlive.isElectron)) {
  if (process.env.NODE_ENV === "production") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register(`${process.env.PUBLIC_URL || ""}/sw.js`).catch(() => {});
    });
  } else {
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});
    if (window.caches) {
      caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
    }
  }
}
