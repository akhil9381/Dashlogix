import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, default: "analyst" },
    avatarUrl: { type: String, default: "" },
    bio: { type: String, default: "" },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
