import Workspace from "@/components/Workspace";
import Shell from "@/components/Shell";

export const metadata = { title: "Decision OS" };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <Workspace><Shell>{children}</Shell></Workspace>;
}
