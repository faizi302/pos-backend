import cloudinary from "../config/cloudinary.js";

/*
|--------------------------------------------------------------------------
| Upload Buffer To Cloudinary
|--------------------------------------------------------------------------
*/

export const uploadToCloudinary = (
  fileBuffer,
  folder = "pos"
) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,

        resource_type: "image",

        transformation: [
          {
            quality: "auto",
            fetch_format: "auto",
          },
        ],
      },

      (error, result) => {
        if (error) {
          return reject(error);
        }

        resolve(result);
      }
    );

    uploadStream.end(fileBuffer);
  });
};

/*
|--------------------------------------------------------------------------
| Delete Image From Cloudinary
|--------------------------------------------------------------------------
*/

export const deleteFromCloudinary = async (publicId) => {
  if (!publicId) return null;

  return cloudinary.uploader.destroy(publicId, {
    resource_type: "image",
  });
};
