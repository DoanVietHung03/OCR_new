import "./globals.css";

export const metadata = { title: "OCR", description: "OCR workspace" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
