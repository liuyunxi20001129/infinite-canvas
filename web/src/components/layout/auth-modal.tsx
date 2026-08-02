import { useState } from "react";
import { Modal, Input, Button, Tabs, message } from "antd";
import { login, register } from "@/services/auth";

type AuthModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function AuthModal({ open, onClose, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, msgHolder] = message.useMessage();

  const handleSubmit = async () => {
    if (!username.trim() || !password.trim()) {
      msg.error("请填写用户名和密码");
      return;
    }
    setLoading(true);
    try {
      if (mode === "login") {
        await login(username.trim(), password);
        msg.success("登录成功");
      } else {
        await register(username.trim(), password);
        msg.success("注册成功，已赠送免费额度");
      }
      setUsername("");
      setPassword("");
      onSuccess();
      onClose();
    } catch (error: any) {
      const err_msg = error?.response?.data?.error?.message || error?.message || "操作失败";
      msg.error(err_msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {msgHolder}
      <Modal
        title={mode === "login" ? "登录" : "注册"}
        open={open}
        onCancel={onClose}
        footer={null}
        centered
        width={400}
      >
        <Tabs
          activeKey={mode}
          onChange={(key) => setMode(key as "login" | "register")}
          items={[
            { key: "login", label: "登录" },
            { key: "register", label: "注册" },
          ]}
        />
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">用户名</label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="3-20 个字符"
              onPressEnter={handleSubmit}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">密码</label>
            <Input.Password
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 个字符"
              onPressEnter={handleSubmit}
            />
          </div>
          <Button type="primary" block loading={loading} onClick={handleSubmit}>
            {mode === "login" ? "登录" : "注册"}
          </Button>
          {mode === "register" && (
            <p className="text-center text-xs text-stone-500">
              注册即赠送免费体验额度
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}
