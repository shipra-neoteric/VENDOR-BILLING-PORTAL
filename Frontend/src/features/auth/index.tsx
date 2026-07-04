import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Form, Input, Button, Typography, Alert } from "antd";
import { useAuth } from "../../context/AuthContext";

const { Title, Text } = Typography;

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onFinish = async (values: { email: string; password: string }) => {
    setLoading(true);
    setError("");
    try {
      await login(values.email, values.password);
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#F8FAFC",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: 420,
          background: "#fff",
          borderRadius: 16,
          padding: "40px 40px 32px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
          border: "1px solid #E5E7EB",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
          <div
            style={{
              width: 40, height: 40,
              background: "#FF7A00",
              borderRadius: 10,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 800, fontSize: 18, color: "#fff",
            }}
          >
            N
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#111827", lineHeight: 1.2 }}>
              Neoteric Properties
            </div>
            <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.2 }}>
              Project Cost Center
            </div>
          </div>
        </div>

        <Title level={4} style={{ margin: "0 0 4px", color: "#111827" }}>Sign in</Title>
        <Text type="secondary" style={{ fontSize: 13, display: "block", marginBottom: 24 }}>
          Enter your credentials to continue
        </Text>

        {error && (
          <Alert message={error} type="error" showIcon style={{ marginBottom: 20, borderRadius: 8 }} />
        )}

        <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item
            label="Email" name="email"
            rules={[
              { required: true, message: "Email is required" },
              { type: "email", message: "Enter a valid email" },
            ]}
          >
            <Input size="large" placeholder="you@example.com" autoComplete="email" />
          </Form.Item>

          <Form.Item
            label="Password" name="password"
            rules={[{ required: true, message: "Password is required" }]}
          >
            <Input.Password size="large" placeholder="••••••••" autoComplete="current-password" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
            <Button type="primary" htmlType="submit" size="large" loading={loading} block style={{ fontWeight: 600 }}>
              Sign in
            </Button>
          </Form.Item>
        </Form>
      </div>
    </div>
  );
}
