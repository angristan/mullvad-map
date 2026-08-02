import "@fontsource-variable/manrope/wght.css";
import { createTheme, MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./global.css";

const theme = createTheme({
  primaryColor: "atlas",
  primaryShade: 5,
  defaultRadius: "md",
  fontFamily: '"Manrope Variable", ui-sans-serif, sans-serif',
  fontFamilyMonospace: '"Manrope Variable", ui-sans-serif, sans-serif',
  colors: {
    atlas: [
      "#e9fff1",
      "#d1fadd",
      "#a9f3bf",
      "#7bea9e",
      "#5ae489",
      "#48df7b",
      "#35c96a",
      "#25ad59",
      "#138e46",
      "#047437",
    ],
  },
  headings: {
    fontFamily: '"Manrope Variable", ui-sans-serif, sans-serif',
    fontWeight: "750",
  },
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root application mount");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MantineProvider theme={theme} forceColorScheme="dark">
        <App />
      </MantineProvider>
    </QueryClientProvider>
  </StrictMode>,
);
