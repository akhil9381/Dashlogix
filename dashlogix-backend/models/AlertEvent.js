import mongoose from "mongoose";

const alertEventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    ruleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AlertRule",
      required: true,
    },
    ruleName: { type: String, required: true },
    queryText: { type: String, required: true },
    threshold: { type: Number, required: true },
    matchedCount: { type: Number, required: true },
    errorCount: { type: Number, default: 0 },
    warningCount: { type: Number, default: 0 },
    triggerReasons: { type: [String], default: [] },
    windowMinutes: { type: Number, required: true },
    emailSent: { type: Boolean, default: false },
    emailTo: { type: String, default: "" },
    error: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("AlertEvent", alertEventSchema);
