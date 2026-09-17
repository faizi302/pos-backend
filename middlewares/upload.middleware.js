import multer from "multer";

/*
|--------------------------------------------------------------------------
| Allowed Image Types
|--------------------------------------------------------------------------
*/

const allowedMimeTypes = [
    "image/jpeg",
    "image/png",
    "image/webp"
];

/*
|--------------------------------------------------------------------------
| Multer Memory Storage
|--------------------------------------------------------------------------
|
| Files stay temporarily in memory.
| They are NOT saved to the server's local filesystem.
|
| This is better for cloud uploads and production deployments.
|
*/

const storage = multer.memoryStorage();

/*
|--------------------------------------------------------------------------
| File Filter
|--------------------------------------------------------------------------
*/

const fileFilter = (req, file, cb) => {
  console.log("Uploaded file:", {
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
  });

  if (allowedMimeTypes.includes(file.mimetype)) {
    return cb(null, true);
  }

  cb(
    new Error(
      `Invalid image type: ${file.mimetype}. Only JPG, JPEG, PNG and WEBP are allowed.`
    )
  );
};

/*
|--------------------------------------------------------------------------
| Upload Configuration
|--------------------------------------------------------------------------
*/

const upload = multer({
  storage,

  fileFilter,

  limits: {
    // 5 MB per image
    fileSize: 5 * 1024 * 1024,

    // Maximum number of files in one request
    files: 10,
  },
});

export default upload;
