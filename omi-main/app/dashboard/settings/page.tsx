"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import DashboardNavigation from "@/components/dashboard-navigation";

type UserProfile = {
  id: string;
  email: string;
  full_name: string;
  wallet_address: string;
  tier: string;
  device_verification: boolean;
  created_at: string;
  pin_set: boolean;
  pin_hash: string | null;
};

type MessageEntry = {
  type: "success" | "error";
  text: string;
};

export default function SettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [fullName, setFullName] = useState<string>("");
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [newEmail, setNewEmail] = useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [currentPin, setCurrentPin] = useState<string>("");
  const [newPin, setNewPin] = useState<string>("");
  const [confirmPin, setConfirmPin] = useState<string>("");
  const [deviceVerification, setDeviceVerification] = useState<boolean>(false);
  const [messages, setMessages] = useState<Record<string, MessageEntry>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const router = useRouter();

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("id", user.id)
      .single();
    setProfile(data);
    setFullName(data?.full_name || "");
    setWalletAddress(data?.wallet_address || "");
    setNewEmail(user.email || "");
    setDeviceVerification(data?.device_verification || false);
    setLoading(false);
  }

  function setMsg(section: string, type: "success" | "error", text: string) {
    setMessages((prev) => ({ ...prev, [section]: { type, text } }));
  }

  async function saveProfile() {
    if (!profile) return;
    try {
      const { error } = await supabase
        .from("users")
        .update({
          full_name: fullName,
          wallet_address: walletAddress,
          updated_at: new Date().toISOString(),
        })
        .eq("id", profile.id);
      if (error) throw error;
      loadProfile();
      setMsg("profile", "success", "Profile updated successfully.");
    } catch (err: unknown) {
      setMsg("profile", "error", (err as Error).message);
    }
  }

  async function updateEmail() {
    if (!newEmail) return;
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) throw error;
      setMsg("email", "success", "Confirmation sent to new email.");
    } catch (err: unknown) {
      setMsg("email", "error", (err as Error).message);
    }
  }

  async function updatePassword() {
    if (newPassword !== confirmPassword) {
      setMsg("password", "error", "Passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setMsg("password", "error", "Password must be at least 8 characters.");
      return;
    }
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
      setMsg("password", "success", "Password updated.");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      setMsg("password", "error", (err as Error).message);
    }
  }

  async function hashPin(pin: string, userId: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin + userId);
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async function updatePin() {
    if (!profile) return;
    if (newPin.length < 4 || newPin.length > 6) {
      setMsg("pin", "error", "PIN must be 4-6 digits.");
      return;
    }
    if (newPin !== confirmPin) {
      setMsg("pin", "error", "PINs do not match.");
      return;
    }
    if (!/^\d+$/.test(newPin)) {
      setMsg("pin", "error", "PIN must only contain numbers.");
      return;
    }
    try {
      if (profile.pin_set && profile.pin_hash) {
        const { data } = await supabase
          .from("users")
          .select("pin_hash")
          .eq("id", profile.id)
          .single();

        const currentHash = await hashPin(currentPin, profile.id);
        if (currentHash !== data?.pin_hash) {
          setMsg("pin", "error", "Current PIN is incorrect.");
          return;
        }
      }

      const newHash = await hashPin(newPin, profile.id);
      await supabase
        .from("users")
        .update({
          pin_hash: newHash,
          pin_set: true,
          pin_attempts: 0,
          pin_locked: false,
        })
        .eq("id", profile.id);

      setMsg("pin", "success", "PIN updated successfully.");
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      loadProfile();
    } catch (err: unknown) {
      setMsg("pin", "error", (err as Error).message);
    }
  }

  async function toggleDeviceVerification() {
    if (!profile) return;
    const newVal = !deviceVerification;
    await supabase
      .from("users")
      .update({ device_verification: newVal })
      .eq("id", profile.id);
    setDeviceVerification(newVal);
    setMsg(
      "security",
      "success",
      `Device verification ${newVal ? "enabled" : "disabled"}.`
    );
  }

  async function logoutAllSessions() {
    await supabase.auth.signOut({ scope: "global" });
    router.push("/auth/signin");
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/auth/signin");
  }

  function MsgBox({ section }: { section: string }) {
    const m = messages[section];
    if (!m) return null;
    return (
      <div
        className={`p-2 rounded text-xs ${
          m.type === "success"
            ? "bg-emerald-900 text-emerald-300"
            : "bg-red-900 text-red-300"
        }`}
      >
        {m.text}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-200">
      <DashboardNavigation />

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-6 pb-24 md:pb-6 space-y-6 max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold text-emerald-400">Settings</h1>

          {/* Account Info */}
          <Card className="p-6 bg-slate-900 border-slate-800 space-y-3">
            <h2 className="text-lg font-semibold text-white">
              Account Information
            </h2>
            <div className="text-sm space-y-1">
              <p className="text-slate-400">
                Email: <span className="text-white">{profile?.email}</span>
              </p>
              <p className="text-slate-400">
                Node Level:{" "}
                <span className="text-white capitalize">{profile?.tier}</span>
              </p>
              <p className="text-slate-400">
                Member Since:{" "}
                <span className="text-white">
                  {profile?.created_at
                    ? new Date(profile.created_at).toLocaleDateString()
                    : "—"}
                </span>
              </p>
            </div>
          </Card>

          {/* Profile */}
          <Card className="p-6 bg-slate-900 border-slate-800 space-y-4">
            <h2 className="text-lg font-semibold text-white">Profile</h2>
            <MsgBox section="profile" />
            <div>
              <label className="text-slate-400 text-xs mb-1 block">
                Full Name
              </label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="bg-slate-800 text-white border-slate-700"
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">
                Wallet Address
              </label>
              <Input
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="Your payment wallet address"
                className="bg-slate-800 text-white border-slate-700"
              />
            </div>
            <Button
              onClick={saveProfile}
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              Save Profile
            </Button>
          </Card>

          {/* Email */}
          <Card className="p-6 bg-slate-900 border-slate-800 space-y-4">
            <h2 className="text-lg font-semibold text-white">Change Email</h2>
            <MsgBox section="email" />
            <div>
              <label className="text-slate-400 text-xs mb-1 block">
                New Email
              </label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="bg-slate-800 text-white border-slate-700"
              />
            </div>
            <Button
              onClick={updateEmail}
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              Update Email
            </Button>
          </Card>

          {/* Password */}
          <Card className="p-6 bg-slate-900 border-slate-800 space-y-4">
            <h2 className="text-lg font-semibold text-white">
              Change Password
            </h2>
            <MsgBox section="password" />
            <div>
              <label className="text-slate-400 text-xs mb-1 block">
                New Password
              </label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="bg-slate-800 text-white border-slate-700"
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">
                Confirm Password
              </label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="bg-slate-800 text-white border-slate-700"
              />
            </div>
            <Button
              onClick={updatePassword}
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              Update Password
            </Button>
          </Card>

          {/* PIN */}
          <Card className="p-6 bg-slate-900 border-slate-800 space-y-4">
            <h2 className="text-lg font-semibold text-white">
              {profile?.pin_set ? "Change Security PIN" : "Set Security PIN"}
            </h2>
            <MsgBox section="pin" />

            {profile?.pin_set && (
              <div>
                <label className="text-slate-400 text-xs mb-1 block">
                  Current PIN
                </label>
                <Input
                  type="password"
                  inputMode="numeric"
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value)}
                  className="bg-slate-800 text-white border-slate-700"
                />
              </div>
            )}

            <div>
              <label className="text-slate-400 text-xs mb-1 block">
                New PIN
              </label>
              <Input
                type="password"
                inputMode="numeric"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                className="bg-slate-800 text-white border-slate-700"
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">
                Confirm New PIN
              </label>
              <Input
                type="password"
                inputMode="numeric"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                className="bg-slate-800 text-white border-slate-700"
              />
            </div>
            <Button
              onClick={updatePin}
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              {profile?.pin_set ? "Update PIN" : "Set PIN"}
            </Button>
          </Card>

          {/* Security */}
          <Card className="p-6 bg-slate-900 border-slate-800 space-y-4">
            <h2 className="text-lg font-semibold text-white">Security</h2>
            <MsgBox section="security" />
            <div className="flex justify-between items-center">
              <div>
                <p className="text-white text-sm">Device Verification</p>
                <p className="text-slate-400 text-xs">
                  Require fingerprint check on each login
                </p>
              </div>
              <button
                onClick={toggleDeviceVerification}
                className={`w-12 h-6 rounded-full transition-colors ${
                  deviceVerification ? "bg-emerald-500" : "bg-slate-700"
                }`}
              >
                <span
                  className={`block w-5 h-5 bg-white rounded-full mx-0.5 transition-transform ${
                    deviceVerification ? "translate-x-6" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            <Button
              onClick={logoutAllSessions}
              variant="outline"
              className="w-full border-red-800 text-red-400 hover:bg-red-900"
            >
              Logout from All Sessions
            </Button>
            <Button
              onClick={logout}
              className="w-full bg-red-700 hover:bg-red-600 text-white"
            >
              Sign Out
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}