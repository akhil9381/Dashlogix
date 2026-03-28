import mongoose from "mongoose";

const alertRuleSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    queryText: { type: String, required: true, trim: true },
    metricType: {
      type: String,
      enum: ["error", "warning", "all"],
      default: "error",
    },
    threshold: { type: Number, required: true, min: 1, default: 10 },
    errorThreshold: { type: Number, min: 0, default: 0 },
    warningThreshold: { type: Number, min: 0, default: 0 },
    windowMinutes: { type: Number, required: true, min: 1, default: 5 },
    checkEveryMinutes: { type: Number, required: true, min: 1, default: 1 },
    cooldownMinutes: { type: Number, required: true, min: 1, default: 10 },
    emailTo: { type: String, trim: true, default: "" },
    autoEmail: { type: Boolean, default: false },
    enabled: { type: Boolean, default: true },
    lastCheckedAt: { type: Date, default: null },
    lastTriggeredAt: { type: Date, default: null },
    lastTriggeredCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("AlertRule", alertRuleSchema);
