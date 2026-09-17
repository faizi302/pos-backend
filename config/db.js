import mongoose from "mongoose";

const connectDB = async () => {
  try {
    const options = {
      maxPoolSize: 10,                 // Maximum number of connections in the pool
      minPoolSize: 2,                  // Minimum number of connections
      serverSelectionTimeoutMS: 5000,  // Timeout for server selection
      socketTimeoutMS: 45000,          // Close sockets after 45s of inactivity
      family: 4,                       // Use IPv4
    };

    const conn = await mongoose.connect(process.env.MONGO_URI, options);

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📦 Database Name: ${conn.connection.name}`);
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error.message);
    process.exit(1); // Exit process with failure
  }
};

// Connection event listeners
mongoose.connection.on("connected", () => {
  console.log("🔗 Mongoose connected to DB");
});

mongoose.connection.on("error", (err) => {
  console.error("❌ Mongoose connection error:", err.message);
});

mongoose.connection.on("disconnected", () => {
  console.warn("⚠️  Mongoose disconnected from DB");
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  try {
    await mongoose.connection.close();
    console.log(`MongoDB connection closed due to ${signal}`);
    process.exit(0);
  } catch (error) {
    console.error("Error during MongoDB disconnection:", error.message);
    process.exit(1);
  }
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

export default connectDB;