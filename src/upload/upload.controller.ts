import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { mkdirSync } from 'fs';
import { extname, join } from 'path';

const uploadDir = join(process.cwd(), 'tmp', 'uploads');
mkdirSync(uploadDir, { recursive: true });

function safeFilename(originalName: string): string {
  const extension = extname(originalName || '').toLowerCase();
  const allowedExtension = extension || '.jpg';
  const base = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${base}${allowedExtension}`;
}

@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: uploadDir,
        filename: (_req, file, callback) => {
          callback(null, safeFilename(file.originalname));
        },
      }),
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
  uploadFile(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const host = `${req.get('x-forwarded-host') || req.get('host') || ''}`.trim();
    const protocol = `${req.get('x-forwarded-proto') || req.protocol || 'http'}`
      .split(',')[0]
      .trim();
    const path = `/uploads/${file.filename}`;

    return {
      url: host ? `${protocol}://${host}${path}` : path,
      filename: file.filename,
      mimetype: file.mimetype,
      size: file.size,
    };
  }
}
