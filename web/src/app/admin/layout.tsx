import type { ReactNode } from "react";
import { AdminNavigation } from "../../components/admin/admin-navigation";
import { RoleGuard } from "../../components/auth/role-guard";
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <RoleGuard><div className="admin-workspace-shell"><AdminNavigation /><div className="admin-workspace-content">{children}</div></div></RoleGuard>;
}
