import mongoose from "mongoose";

const searchHistorySchema = new mongoose.Schema({
  query: String,
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("SearchHistory", searchHistorySchema);
