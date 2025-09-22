const sharp = require('sharp');

class MediaUtils {
    async processImageForSticker(buffer) {
        try {
            // Convert image to WebP format for sticker
            const processedBuffer = await sharp(buffer)
                .resize(512, 512, {
                    fit: 'contain',
                    background: { r: 255, g: 255, b: 255, alpha: 0 }
                })
                .webp()
                .toBuffer();
            
            return processedBuffer;
        } catch (error) {
            console.error('Error processing image for sticker:', error);
            return null;
        }
    }
    
    async compressImage(buffer, quality = 60) {
        try {
            const compressedBuffer = await sharp(buffer)
                .jpeg({ quality })
                .toBuffer();
            
            return compressedBuffer;
        } catch (error) {
            console.error('Error compressing image:', error);
            return null;
        }
    }
    
    async resizeImage(buffer, width, height) {
        try {
            const resizedBuffer = await sharp(buffer)
                .resize(width, height, {
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .toBuffer();
            
            return resizedBuffer;
        } catch (error) {
            console.error('Error resizing image:', error);
            return null;
        }
    }
    
    async getImageInfo(buffer) {
        try {
            const metadata = await sharp(buffer).metadata();
            return {
                width: metadata.width,
                height: metadata.height,
                format: metadata.format,
                size: buffer.length
            };
        } catch (error) {
            console.error('Error getting image info:', error);
            return null;
        }
    }
    
    async convertToWebP(buffer) {
        try {
            const webpBuffer = await sharp(buffer)
                .webp({ quality: 80 })
                .toBuffer();
            
            return webpBuffer;
        } catch (error) {
            console.error('Error converting to WebP:', error);
            return null;
        }
    }
    
    isValidImageBuffer(buffer) {
        try {
            // Check if buffer starts with common image magic numbers
            const magicNumbers = {
                jpg: [0xFF, 0xD8, 0xFF],
                png: [0x89, 0x50, 0x4E, 0x47],
                gif: [0x47, 0x49, 0x46, 0x38],
                webp: [0x52, 0x49, 0x46, 0x46]
            };
            
            for (const [format, magic] of Object.entries(magicNumbers)) {
                if (buffer.length >= magic.length) {
                    const matches = magic.every((byte, index) => buffer[index] === byte);
                    if (matches) return true;
                }
            }
            
            return false;
        } catch (error) {
            return false;
        }
    }
    
    async createThumbnail(buffer, size = 150) {
        try {
            const thumbnail = await sharp(buffer)
                .resize(size, size, {
                    fit: 'cover',
                    position: 'center'
                })
                .jpeg({ quality: 70 })
                .toBuffer();
            
            return thumbnail;
        } catch (error) {
            console.error('Error creating thumbnail:', error);
            return null;
        }
    }
}

module.exports = new MediaUtils();
