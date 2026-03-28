import mongoose from "mongoose";

const userActivitySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, required: true },
    page: { type: String, default: "" },
    details: { type: Object, default: {} },
  },
  { timestamps: true }
);

export default mongoose.model("UserActivity", userActivitySchema);
