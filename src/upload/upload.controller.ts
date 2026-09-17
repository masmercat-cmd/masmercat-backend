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
import { extname } from 'path';
import * as AWS from 'aws-sdk';

function safeFilename(originalName: string): string {
  const extension = extname(originalName || '').toLowerCase();
  const allowedExtension = extension || '.jpg';
  const base = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${base}${allowedExtension}`;
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
        if (!file.mimetype.startsWith('image/')) {
          callback(new BadRequestException('Only image uploads are allowed'), false);
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

    const { bucket, region } = requiredStorageConfig();
    const filename = safeFilename(file.originalname);
    const key = `lots/${req.user.id}/${filename}`;
    const s3 = new AWS.S3({ region });
    await s3.putObject({
      Bucket: bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      CacheControl: 'public, max-age=31536000, immutable',
    }).promise();
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
}
