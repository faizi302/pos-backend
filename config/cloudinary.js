import { v2 as cloudinary } from "cloudinary";

const requiredEnv = [
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];

const missingEnv = requiredEnv.filter(
  (key) => !process.env[key]
);

if (missingEnv.length > 0) {
  throw new Error(
    `Missing Cloudinary environment variables: ${missingEnv.join(", ")}`
  );
}
console.log("CLOUDINARY DEBUG:", {
  cloudName: process.env.CLOUDINARY_CLOUD_NAME,
  apiKeyExists: Boolean(process.env.CLOUDINARY_API_KEY),
  apiSecretExists: Boolean(process.env.CLOUDINARY_API_SECRET),
});

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export default cloudinary;
