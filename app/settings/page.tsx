"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

function broadcastProfileUpdated() {
  try {
    new BroadcastChannel("register-profile").postMessage({ type: "profile-updated" });
  } catch {}
}
import Link from "next/link";
import { createClient, uploadProfileImage, uploadBackgroundImage } from "@/lib/supabase";
import { getSessionWithRetry } from "@/lib/supabase";
import { getUserByAuthId, updateUser, type AppUser } from "@/lib/workspace-storage";

export default function SettingsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AppUser | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [appRole, setAppRole] = useState("");
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [uploadingBg, setUploadingBg] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const session = await getSessionWithRetry(500);
      if (!session?.user) {
        router.replace("/login");
        return;
      }
      setAuthUserId(session.user.id);
      const { data, error: err } = await getUserByAuthId(session.user.id, session.user.id);
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      if (data) {
        setUser(data);
        setFullName(data.full_name ?? "");
        setEmail(data.email ?? "");
        setAppRole(data.app_role ?? "");
        setProfileImage(data.profile_image && String(data.profile_image).trim() ? data.profile_image : null);
        setBgImage(data.user_bg_image && String(data.user_bg_image).trim() ? data.user_bg_image : null);
      }
      setLoading(false);
    })();
  }, [router]);

  const handleProfileImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !authUserId) return;
    setUploadingImage(true);
    setError(null);
    const { url, error: uploadErr } = await uploadProfileImage(file, authUserId);
    if (uploadErr) {
      setError(uploadErr.message);
      setUploadingImage(false);
      return;
    }
    if (url) {
      const { error: updateErr } = await updateUser(
        authUserId,
        { profile_image: url },
        authUserId
      );
      if (updateErr) {
        setError(updateErr.message);
      } else {
        setProfileImage(url);
        setUser((prev) => (prev ? { ...prev, profile_image: url } : null));
        setSuccess("Profile image updated.");
        broadcastProfileUpdated();
        setTimeout(() => broadcastProfileUpdated(), 3000);
      }
    }
    setUploadingImage(false);
    e.target.value = "";
  };

  const bgInputRef = useRef<HTMLInputElement>(null);
  const handleBgImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !authUserId) return;
    setUploadingBg(true);
    setError(null);
    const { url, error: uploadErr } = await uploadBackgroundImage(file, authUserId);
    if (uploadErr) {
      setError(uploadErr.message);
      setUploadingBg(false);
      return;
    }
    if (url) {
      const { error: updateErr } = await updateUser(
        authUserId,
        { user_bg_image: url },
        authUserId
      );
      if (updateErr) {
        setError(updateErr.message);
      } else {
        setBgImage(url);
        setUser((prev) => (prev ? { ...prev, user_bg_image: url } : null));
        setSuccess("Background image updated.");
        broadcastProfileUpdated();
        setTimeout(() => broadcastProfileUpdated(), 3000);
      }
    }
    setUploadingBg(false);
    e.target.value = "";
  };

  const handleRemoveBgImage = async () => {
    if (!authUserId) return;
    setUploadingBg(true);
    setError(null);
    const { error: updateErr } = await updateUser(
      authUserId,
      { user_bg_image: "" },
      authUserId
    );
    if (updateErr) setError(updateErr.message);
    else {
      setBgImage(null);
      setUser((prev) => (prev ? { ...prev, user_bg_image: null } : null));
      setSuccess("Background image removed.");
      broadcastProfileUpdated();
      setTimeout(() => broadcastProfileUpdated(), 3000);
    }
    setUploadingBg(false);
  };

  const handleSave = async () => {
    if (!authUserId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    const { error: err } = await updateUser(
      authUserId,
      { full_name: fullName, email },
      authUserId
    );
    if (err) {
      setSaving(false);
      setError(err.message);
      return;
    }
    if (newPassword.trim().length >= 6) {
      const supabase = createClient();
      const { error: pwdErr } = await supabase.auth.updateUser({ password: newPassword.trim() });
      if (pwdErr) {
        setSaving(false);
        setError(pwdErr.message);
        return;
      }
      setNewPassword("");
    }
    setSaving(false);
    setSuccess("Profile updated.");
    setUser((prev) =>
      prev
        ? { ...prev, full_name: fullName, email }
        : null
    );
    broadcastProfileUpdated();
    setTimeout(() => broadcastProfileUpdated(), 3000);
  };

  const handleRemoveProfileImage = async () => {
    if (!authUserId) return;
    setUploadingImage(true);
    setError(null);
    const { error: updateErr } = await updateUser(
      authUserId,
      { profile_image: "" },
      authUserId
    );
    if (updateErr) setError(updateErr.message);
    else {
      setProfileImage(null);
      setUser((prev) => (prev ? { ...prev, profile_image: null } : null));
      setSuccess("Profile image removed.");
      broadcastProfileUpdated();
      setTimeout(() => broadcastProfileUpdated(), 3000);
    }
    setUploadingImage(false);
  };

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-navy-950 flex items-center justify-center">
        <p className="text-white/60">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy-950 text-white">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-white/70 hover:text-white flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m15 18-6-6 6-6" />
            </svg>
            Dashboard
          </Link>
          <h1 className="text-xl font-semibold">Settings</h1>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="px-4 py-2 rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
        >
          Sign out
        </button>
      </header>

      <main className="p-6 max-w-md mx-auto">
        {error && (
          <p className="mb-4 p-3 rounded-xl bg-red-500/10 text-red-200 border border-red-400/30">
            {error}
          </p>
        )}
        {success && (
          <p className="mb-4 p-3 rounded-xl bg-emerald-500/10 text-emerald-200 border border-emerald-400/30">
            {success}
          </p>
        )}
        <div className="rounded-xl border border-white/10 bg-navy-900/30 p-6 space-y-4">
          <div className="flex flex-col items-center gap-3 pb-4 border-b border-white/10">
            <div className="relative">
              <div className="w-24 h-24 rounded-full overflow-hidden bg-navy-800 flex items-center justify-center">
                {uploadingImage ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg className="animate-spin h-8 w-8 text-white/60" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  </div>
                ) : profileImage ? (
                  <img
                    src={profileImage}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/40">
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handleProfileImageChange}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-navy-700 hover:bg-navy-600 flex items-center justify-center text-white text-sm disabled:opacity-60"
              >
                {uploadingImage ? "…" : "+"}
              </button>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                className="text-sm text-navy-300 hover:text-white"
              >
                {profileImage ? "Change photo" : "Add photo"}
              </button>
              {profileImage && (
                <button
                  type="button"
                  onClick={handleRemoveProfileImage}
                  disabled={uploadingImage}
                  className="text-sm text-red-300 hover:text-red-200"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="block text-white/60 text-sm mb-1">Full name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-xl p-3 bg-navy-900/80 border border-navy-800 text-white placeholder:text-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-400"
              placeholder="Full name"
            />
          </div>
          <div>
            <label className="block text-white/60 text-sm mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl p-3 bg-navy-900/80 border border-navy-800 text-white placeholder:text-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-400"
              placeholder="Email"
            />
          </div>
          <div>
            <label className="block text-white/60 text-sm mb-1">Role</label>
            <div className="w-full rounded-xl p-3 bg-navy-800/60 border border-navy-800 text-white/80 cursor-not-allowed">
              {appRole === "superadmin" ? "Superadmin" : appRole === "admin" ? "Admin" : "User"}
            </div>
            <p className="text-white/40 text-xs mt-1">Only an admin can change your role.</p>
          </div>
          <div className="border-t border-white/10 pt-4">
            <label className="block text-white/60 text-sm mb-1">Background image</label>
            <p className="text-white/50 text-xs mb-2">Shown behind dashboard and workspace. Same for all pages.</p>
            {bgImage ? (
              <div className="relative rounded-xl overflow-hidden border border-white/10 bg-navy-900/50 aspect-video max-h-32">
                <img src={bgImage} alt="Background" className="w-full h-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 hover:opacity-100 transition">
                  <input
                    ref={bgInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="hidden"
                    onChange={handleBgImageChange}
                  />
                  <button
                    type="button"
                    onClick={() => bgInputRef.current?.click()}
                    disabled={uploadingBg}
                    className="px-3 py-1.5 rounded-lg bg-navy-700 text-white text-sm hover:bg-navy-600 disabled:opacity-60"
                  >
                    {uploadingBg ? "…" : "Change"}
                  </button>
                  <button
                    type="button"
                    onClick={handleRemoveBgImage}
                    disabled={uploadingBg}
                    className="px-3 py-1.5 rounded-lg bg-red-500/80 text-white text-sm hover:bg-red-500 disabled:opacity-60"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <input
                  ref={bgInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className="hidden"
                  onChange={handleBgImageChange}
                />
                <button
                  type="button"
                  onClick={() => bgInputRef.current?.click()}
                  disabled={uploadingBg}
                  className="w-full rounded-xl p-4 border-2 border-dashed border-navy-700 text-white/60 hover:border-navy-600 hover:text-white/80 transition disabled:opacity-60"
                >
                  {uploadingBg ? "Uploading…" : "Upload background image"}
                </button>
              </div>
            )}
          </div>
          <div>
            <label className="block text-white/60 text-sm mb-1">New password (optional)</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-xl p-3 bg-navy-900/80 border border-navy-800 text-white placeholder:text-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-400"
              placeholder="Leave blank to keep current password (min 6 chars)"
            />
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-navy-700 text-white p-3 rounded-xl font-semibold hover:bg-navy-600 transition disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </main>
    </div>
  );
}
