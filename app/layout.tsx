import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Barber — Encontre sua barbearia",
    template: "%s | Barber",
  },
  description:
    "Encontre barbearias, conheça serviços e organize seus próximos agendamentos em um só lugar.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark">
      <body>{children}</body>
    </html>
  );
}
