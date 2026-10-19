import type { Metadata } from "next";
import Shell from "@/components/admin/Shell";
import "./admin.css";

export const metadata: Metadata = {
  title: { default: "Backoffice", template: "%s · Backoffice iNurse" },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <Shell>{children}</Shell>;
}
