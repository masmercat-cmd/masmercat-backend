import {
  BadRequestException,
  Controller,
  Post,
  Req,
  ServiceUnavailableException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const IMAGE_TYPES: Record<string, { extension: string; signatures: number[][] }> = {
  'image/jpeg': { extension: '.jpg', signatures: [[0xff, 0xd8, 0xff]] },
  'image/png': { extension: '.png', signatures: [[0x89, 0x50, 0x4e, 0x47]] },
  'image/webp': { extension: '.webp', signatures: [[0x52, 0x49, 0x46, 0x46]] },
};
const CERTIFICATE_TYPES: Record<string, { extension: string; signatures: number[][] }> = {
  ...IMAGE_TYPES,
  'application/pdf': { extension: '.pdf', signatures: [[0x25, 0x50, 0x44, 0x46]] },
};

function hasSignature(buffer: Buffer, signatures: number[][]): boolean {
  return signatures.some((signature) =>
    signature.every((byte, index) => buffer[index] === byte),
  );
}

function isValidImageBuffer(buffer: Buffer, mimetype: string): boolean {
  const imageType = IMAGE_TYPES[mimetype];
  if (!imageType || !hasSignature(buffer, imageType.signatures)) return false;
  if (mimetype === 'image/webp') {
    return buffer.length >= 12 && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return true;
}

function safeFilename(extension: string): string {
  const base = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${base}${extension}`;
}

function requiredStorageConfig() {
  const bucket = process.env.AWS_S3_BUCKET?.trim();
  const region = process.env.AWS_REGION?.trim();
  if (!bucket || !region || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new ServiceUnavailableException('Persistent image storage is not configured');
  }
  return { bucket, region };
}

@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
      fileFilter: (_req, file, callback) => {
        if (!IMAGE_TYPES[file.mimetype]) {
          callback(new BadRequestException('Only JPG, PNG and WebP images are allowed'), false);
          return;
        }

        callback(null, true);
      },
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const imageType = IMAGE_TYPES[file.mimetype];
    if (!imageType || !isValidImageBuffer(file.buffer, file.mimetype)) {
      throw new BadRequestException('The uploaded file is not a valid image');
    }

    const { bucket, region } = requiredStorageConfig();
    const filename = safeFilename(imageType.extension);
    const key = `lots/${req.user.id}/${filename}`;
    const s3 = new S3Client({ region });
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      CacheControl: 'public, max-age=31536000, immutable',
      ServerSideEncryption: 'AES256',
    }));
    const publicBase = process.env.AWS_S3_PUBLIC_BASE_URL?.trim()?.replace(/\/$/, '');
    const url = publicBase
      ? `${publicBase}/${key}`
      : `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

    return {
      url,
      filename,
      mimetype: file.mimetype,
      size: file.size,
    };
  }

  @Post('certificate')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, callback) => {
        if (!CERTIFICATE_TYPES[file.mimetype]) {
          callback(new BadRequestException('Only PDF, JPG, PNG and WebP files are allowed'), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  async uploadCertificate(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
    if (!file) throw new BadRequestException('File is required');
    const type = CERTIFICATE_TYPES[file.mimetype];
    if (!type || !hasSignature(file.buffer, type.signatures)) {
      throw new BadRequestException('The uploaded certificate is not a valid file');
    }
    if (file.mimetype === 'image/webp' && !isValidImageBuffer(file.buffer, file.mimetype)) {
      throw new BadRequestException('The uploaded certificate is not a valid image');
    }

    const { bucket, region } = requiredStorageConfig();
    const key = `certificates/${req.user.id}/${safeFilename(type.extension)}`;
    const s3 = new S3Client({ region });
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ServerSideEncryption: 'AES256',
      CacheControl: 'private, no-store',
    }));

    // Store an internal reference, never a permanent public certificate URL.
    return { documentRef: `s3://${bucket}/${key}` };
  }
}
