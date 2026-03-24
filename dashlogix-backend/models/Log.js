import mongoose from "mongoose";

const logSchema = new mongoose.Schema({
  time: String,
  host: String,
  source: String,
  log: String,
  query: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("Log", logSchema);
