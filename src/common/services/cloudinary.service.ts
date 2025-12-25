import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import * as dotenv from 'dotenv';
dotenv.config();

@Injectable()
export class CloudinaryService {
    constructor() {
        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET,
        });
    }

    /**
     * Upload PDF to Cloudinary with folder structure
     * @param buffer PDF buffer
     * @param publicId Full public ID with folder path (e.g., prescriptions/patient_xxx/visit_xxx/prescription_v1)
     * @returns Upload result with secure URL and public ID
     */
    async uploadPDF(buffer: Buffer, publicId: string): Promise<{ secure_url: string; public_id: string }> {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    resource_type: 'image',
                    public_id: publicId,
                    overwrite: true,
                    format: 'pdf',
                },
                (error, result) => {
                    if (error) {
                        reject(error);
                    } else {
                        if (!result) {
                            return reject(new Error('Cloudinary upload failed: No result returned'));
                        }
                        resolve({
                            secure_url: result.secure_url,
                            public_id: result.public_id,
                        });
                    }
                },
            );

            const stream = Readable.from(buffer);
            stream.pipe(uploadStream);
        });
    }

    /**
     * Generate signed URL with expiry
     * @param publicId Cloudinary public ID
     * @param expiresIn Expiry time in seconds (default: 300 = 5 minutes)
     * @returns Signed URL
     */
    getSignedUrl(publicId: string, expiresIn: number = 300): string {
        const timestamp = Math.floor(Date.now() / 1000) + expiresIn;

        return cloudinary.url(publicId, {
            resource_type: 'image',
            type: 'upload',
            sign_url: true,
            secure: true,
            expires_at: timestamp,
        });
    }

    /**
     * Delete PDF from Cloudinary
     * @param publicId Cloudinary public ID
     */
    async deletePDF(publicId: string): Promise<void> {
        await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    }
}
