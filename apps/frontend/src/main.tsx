import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Records/conflicts are shared, live-updated state — SSE tells us exactly when
      // to refetch (see useSse.ts), so we don't need react-query's own polling/refetch
      // heuristics fighting with that.
      refetchOnWindowFocus: false,
      staleTime: 10_000,
    },
  },
});

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("#root element not found");

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
