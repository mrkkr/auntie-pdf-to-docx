import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Auntie PDF - Your Sassy PDF Guru",
  description: "Your all-knowing guide that unpacks every PDF into clear, actionable insights",
  icons: {
    icon: "/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-50`}
      >
        <div className="flex min-h-screen flex-col">
          <header className="bg-red-600 text-white shadow-md">
            <div className="container mx-auto py-4 px-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src="/logo.svg" alt="Aunti PDF Logo" className="h-12 w-12" />
                <h1 className="text-2xl font-bold">Aunti PDF</h1>
              </div>
              <p className="text-sm italic hidden md:block">Your sassy guide to PDF enlightenment</p>
            </div>
          </header>
          <main className="flex-1">
            {children}
          </main>
          <footer className="bg-gray-100 border-t border-gray-200 py-4">
            <div className="container mx-auto px-4 text-center text-sm text-gray-600">
              <p>© {new Date().getFullYear()} Aunti PDF - Sassy PDF processing with attitude</p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
