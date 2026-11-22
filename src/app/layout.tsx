import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { Providers } from "@/components/providers";

// Apple's system font (SF Pro) is used where available; Inter is the closest
// stand-in on Windows/Android.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Registro de tareas diarias",
  description: "Notas de trabajo en estilo Notion. Tablero Kanban, listas de tareas y registro diario.",
  keywords: ["Notion", "Kanban", "Tareas", "Notas", "Trabajo"],
  authors: [{ name: "Registro de tareas diarias" }],
};

// iPad browsers default to "desktop mode" and lay pages out wider than the
// screen (cut off on the right). shrink-to-fit=no opts out, so the responsive
// layout uses the real width. Next has no field for it; `width` is copied
// verbatim into the tag: "width=device-width, shrink-to-fit=no, initial-scale=1".
export const viewport: Viewport = {
  width: "device-width, shrink-to-fit=no",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-AR" suppressHydrationWarning className={`${inter.variable} ${geistMono.variable}`}>
      <body className="antialiased bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <Providers>
            {children}
            <SonnerToaster position="bottom-right" richColors />
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
