import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function ProfilePage() {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || "");
  const [status, setStatus] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setStatus("Saving...");

    try {
      await updateProfile({ name, bio, avatarUrl });
      setStatus("Profile updated.");
    } catch (err) {
      setStatus(err.response?.data?.error || err.message);
    }
  };

  return (
    <section className="page-card">
      <h2>User Profile</h2>
      <div className="profile-top">
        <div className="avatar-chip">{(name || user?.name || "U").slice(0, 1).toUpperCase()}</div>
        <div>
          <div className="profile-email">{user?.email}</div>
          <div className="profile-role">Role: {user?.role || "analyst"}</div>
        </div>
      </div>

      <form className="auth-form" onSubmit={onSubmit}>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" required />
        <input type="text" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="Avatar URL (optional)" />
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Bio" rows={4} />
        <button type="submit">Save profile</button>
      </form>

      {status && <p className="form-error">{status}</p>}
    </section>
  );
}
