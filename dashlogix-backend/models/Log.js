import mongoose from "mongoose";

const logSchema = new mongoose.Schema({
  time: String,
  host: String,
  source: String,
  log: String,
  level: String,
  exactCause: String,
  description: String,
  query: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

logSchema.index({ createdAt: -1 });
logSchema.index({ source: 1, createdAt: -1 });
logSchema.index({ host: 1, createdAt: -1 });

export default mongoose.model("Log", logSchema);
