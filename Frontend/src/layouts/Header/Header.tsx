import { useNavigate } from "react-router-dom";
import { Dropdown } from "antd";
import { LogoutOutlined } from "@ant-design/icons";
import { useAuth } from "../../context/AuthContext";

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "U";

  return (
    <div
      style={{
        height: 64,
        background: "#fff",
        borderBottom: "1px solid #E5E7EB",
        padding: "0 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      {/* Left: Logo + Module name */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 36,
            height: 36,
            background: "#FF7A00",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            fontSize: 15,
            color: "#fff",
            letterSpacing: "-0.5px",
          }}
        >
          N
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#111827", lineHeight: 1.2 }}>
            Neoteric Properties
          </div>
          <div style={{ fontSize: 11, color: "#6B7280", lineHeight: 1.2 }}>
            Vendor Billing Portal
          </div>
        </div>
      </div>

      {/* Right: User */}
      <Dropdown
        menu={{
          items: [{ key: "logout", icon: <LogoutOutlined />, label: "Sign out", danger: true }],
          onClick: ({ key }) => key === "logout" && handleLogout(),
        }}
        trigger={["click"]}
        placement="bottomRight"
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: "#111827", lineHeight: 1.2 }}>
              {user?.name || "User"}
            </div>
            <div style={{ fontSize: 11, color: "#6B7280", lineHeight: 1.2, textTransform: "capitalize" }}>
              {user?.role || ""}
            </div>
          </div>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "#7C3AED",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            {initials}
          </div>
        </div>
      </Dropdown>
    </div>
  );
}
